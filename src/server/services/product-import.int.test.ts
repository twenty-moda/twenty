import { eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parsePhotoName, parseProductSheet, TEMPLATE_COLUMNS } from "@/lib/product-import";
import type { Db } from "../db/client";

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
const { getDb, closeDb } = await import("../db/client");
const schema = await import("../db/schema");
const { planImport, applyImport } = await import("./product-import");

let db: Db;
const header = [...TEMPLATE_COLUMNS];

beforeAll(async () => {
  db = getDb();
  await db.execute(sql`TRUNCATE order_status_history, order_items, orders, customers, promotion_products, promotions,
    product_images, product_redirects, product_variants, products, category_fits, categories, fits, colors, sizes CASCADE`);
  await db.insert(schema.categories).values([
    { slug: "pantalones", name: "Pantalones" },
    { slug: "polos", name: "Polos" },
  ]);
});

afterAll(async () => {
  await closeDb();
});

describe("carga masiva", () => {
  it("crea productos y variantes, y en la segunda carga actualiza por SKU", async () => {
    const first = parseProductSheet([
      header,
      ["Baggy Nuevo", "PANTALONES", "Baggy Jean", "Negro", "30", "TMW-9001", 99, 120, 40, 5, "Jean rígido", "sí"],
      ["Baggy Nuevo", "Pantalones", "Baggy Jean", "negro", "32", "", 99, "", "", 2, "", "sí"],
      ["Polo Básico", "Camisetas", "", "Blanco", "M", "TMW-9003", 30, "", "", 10, "", "sí"],
    ]);
    const plan = await planImport(db, first);
    expect(plan.summary).toMatchObject({ newProducts: 1, newVariants: 2, updated: 0, skipped: 1 });
    expect(plan.issues[0].message).toMatch(/La categoría "Camisetas" no existe/);
    expect(plan.newColors).toEqual(["Negro"]);
    expect(plan.newFits).toEqual(["Baggy Jean"]);

    const { productSlugs } = await applyImport(db, first);
    expect(productSlugs).toEqual(["baggy-nuevo"]);
    const variants = await db.select().from(schema.productVariants).orderBy(schema.productVariants.sku);
    expect(variants.map((v) => [v.sku, v.stock, v.priceCents, v.compareAtPriceCents, v.costCents])).toEqual([
      ["TMW-9001", 5, 9900, 12000, 4000],
      ["TMW-9002", 2, 9900, null, null], // SKU generado, sin costo
    ]);
    const [product] = await db.select().from(schema.products).where(eq(schema.products.slug, "baggy-nuevo"));
    expect(product).toMatchObject({ name: "Baggy Nuevo", status: "active", description: "Jean rígido" });

    // Sin costo en la celda: el que tenía no se borra.
    const second = parseProductSheet([header, ["Baggy Nuevo", "Pantalones", "Baggy Jean", "Negro", "30", "TMW-9001", 89, "", "", 0, "", "no"]]);
    const plan2 = await planImport(db, second);
    expect(plan2.rows[0]).toMatchObject({ action: "actualizar", changes: ["Precio S/ 99 → S/ 89", "Sin precio antes", "Stock 5 → 0", "Se oculta"] });
    await applyImport(db, second);
    const [updated] = await db.select().from(schema.productVariants).where(eq(schema.productVariants.sku, "TMW-9001"));
    expect(updated).toMatchObject({ priceCents: 8900, compareAtPriceCents: null, costCents: 4000, stock: 0, isActive: false });

    expect((await planImport(db, second)).rows[0].action).toBe("sin-cambios");
  });
});

describe("carga masiva «Solo tienda»", () => {
  it("nada sale en la web: producto nuevo solo de tienda, talla nueva de uno publicado apagada y la visibilidad de lo que ya existe no cambia", async () => {
    const { listProductCards, getProductDetail } = await import("./catalog");
    const { listPosVariants } = await import("./pos");
    const { getVariantSnapshots } = await import("./cart");
    const [webWarehouse] = await db.select({ id: schema.warehouses.id }).from(schema.warehouses).where(eq(schema.warehouses.sellsOnline, true));

    // Un producto publicado con una talla visible.
    const web = parseProductSheet([header, ["Cargo Web", "Pantalones", "", "Verde", "30", "TMW-9101", 90, "", "", 3, "", "sí"]]);
    await applyImport(db, web, null, "web");
    expect((await listProductCards(db)).some((c) => c.slug === "cargo-web")).toBe(true);

    const sheet = parseProductSheet([
      header,
      ["Jogger Insaga", "Pantalones", "", "Negro", "Única", "", 75, "", 30, 12, "", "sí"],
      ["Cargo Web", "Pantalones", "", "Verde", "32", "", 90, "", "", 4, "", "sí"],
      ["Cargo Web", "Pantalones", "", "Verde", "30", "TMW-9101", 95, "", "", 3, "", "no"],
    ]);
    const plan = await planImport(db, sheet, "tienda");
    expect(plan.target).toBe("tienda");
    expect(plan.rows.map((r) => [r.action, r.changes])).toEqual([
      ["crear-producto", ["S/ 75 · Stock 12"]],
      ["crear-variante", ["S/ 90 · Stock 4", "Apagada en la web"]],
      ["actualizar", ["Precio S/ 90 → S/ 95"]], // «Visible = no» no cuenta
    ]);
    await applyImport(db, sheet, null, "tienda");

    const [jogger] = await db.select().from(schema.products).where(eq(schema.products.slug, "jogger-insaga"));
    expect(jogger.status).toBe("pos_only");
    const [cargo] = await db.select().from(schema.products).where(eq(schema.products.slug, "cargo-web"));
    const variants = await db.select().from(schema.productVariants).where(inArray(schema.productVariants.productId, [jogger.id, cargo.id]));
    const cargo32 = variants.find((v) => v.productId === cargo.id && v.sku !== "TMW-9101")!;
    expect(cargo32.isActive).toBe(false);
    expect(variants.find((v) => v.sku === "TMW-9101")?.isActive).toBe(true);

    // En la web: el producto de tienda no existe y el publicado sigue solo con su talla 30.
    expect((await listProductCards(db)).some((c) => c.slug === "jogger-insaga")).toBe(false);
    expect(await getProductDetail(db, "jogger-insaga")).toBeNull();
    expect((await listProductCards(db)).find((c) => c.slug === "cargo-web")?.sizes).toEqual(["30"]);
    const joggerVariant = variants.find((v) => v.productId === jogger.id)!;
    const snapshots = await getVariantSnapshots(db, [joggerVariant.id, cargo32.id]);
    expect(snapshots.map((v) => v.available)).toEqual([false, false]);

    // En el punto de venta: se venden los dos.
    const pos = await listPosVariants(db, webWarehouse.id);
    expect(pos.find((v) => v.variantId === joggerVariant.id)).toMatchObject({ stock: 12, priceCents: 7500 });
    expect(pos.find((v) => v.variantId === cargo32.id)).toMatchObject({ stock: 4 });
  });
});

describe("parsePhotoName", () => {
  it("entiende los nombres de foto que ya usa TWENTY", () => {
    expect(parsePhotoName("TMW-0001.webp")).toEqual({ sku: "TMW-0001", position: 0 });
    expect(parsePhotoName("TMW-0001_02.webp")).toEqual({ sku: "TMW-0001", position: 2 });
    expect(parsePhotoName("tmw-0040-01.JPG")).toEqual({ sku: "TMW-0040", position: 1 });
    expect(parsePhotoName("foto sin sku.png")).toBeNull();
  });
});

describe("fotos por SKU", () => {
  it("una nueva subida del mismo SKU y posición reemplaza la foto anterior (nombre nuevo, misma posición)", async () => {
    const { attachPhoto, findVariantForPhoto } = await import("./product-import");
    const [variant] = await db.select().from(schema.productVariants).where(eq(schema.productVariants.sku, "TMW-9001"));
    const target = await findVariantForPhoto(db, "TMW-9001");
    if (!variant || !target) throw new Error("falta la variante de prueba");
    const photos = () => db.select().from(schema.productImages).where(eq(schema.productImages.productId, target.productId)).orderBy(schema.productImages.path);

    await attachPhoto(db, target, "item/TMW-9001.webp", 0, "TMW-9001");
    await attachPhoto(db, target, "item/TMW-9001_02-aaaaaaaa.webp", 2, "TMW-9001_02");
    await attachPhoto(db, target, "item/TMW-9001-bbbbbbbb.webp", 0, "TMW-9001");

    const paths = (await photos()).map((p) => p.path);
    expect(paths).toContain("item/TMW-9001-bbbbbbbb.webp");
    expect(paths).toContain("item/TMW-9001_02-aaaaaaaa.webp");
    expect(paths).not.toContain("item/TMW-9001.webp");
  });
});
