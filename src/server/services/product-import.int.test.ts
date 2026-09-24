import { eq, sql } from "drizzle-orm";
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
      ["Baggy Nuevo", "PANTALONES", "Baggy Jean", "Negro", "30", "TMW-9001", 99, 120, 5, "Jean rígido", "sí"],
      ["Baggy Nuevo", "Pantalones", "Baggy Jean", "negro", "32", "", 99, "", 2, "", "sí"],
      ["Polo Básico", "Camisetas", "", "Blanco", "M", "TMW-9003", 30, "", 10, "", "sí"],
    ]);
    const plan = await planImport(db, first);
    expect(plan.summary).toMatchObject({ newProducts: 1, newVariants: 2, updated: 0, skipped: 1 });
    expect(plan.issues[0].message).toMatch(/La categoría "Camisetas" no existe/);
    expect(plan.newColors).toEqual(["Negro"]);
    expect(plan.newFits).toEqual(["Baggy Jean"]);

    const { productSlugs } = await applyImport(db, first);
    expect(productSlugs).toEqual(["baggy-nuevo"]);
    const variants = await db.select().from(schema.productVariants).orderBy(schema.productVariants.sku);
    expect(variants.map((v) => [v.sku, v.stock, v.priceCents, v.compareAtPriceCents])).toEqual([
      ["TMW-9001", 5, 9900, 12000],
      ["TMW-9002", 2, 9900, null], // SKU generado
    ]);
    const [product] = await db.select().from(schema.products).where(eq(schema.products.slug, "baggy-nuevo"));
    expect(product).toMatchObject({ name: "Baggy Nuevo", status: "active", description: "Jean rígido" });

    const second = parseProductSheet([header, ["Baggy Nuevo", "Pantalones", "Baggy Jean", "Negro", "30", "TMW-9001", 89, "", 0, "", "no"]]);
    const plan2 = await planImport(db, second);
    expect(plan2.rows[0]).toMatchObject({ action: "actualizar", changes: ["Precio S/ 99 → S/ 89", "Sin precio antes", "Stock 5 → 0", "Se oculta"] });
    await applyImport(db, second);
    const [updated] = await db.select().from(schema.productVariants).where(eq(schema.productVariants.sku, "TMW-9001"));
    expect(updated).toMatchObject({ priceCents: 8900, compareAtPriceCents: null, stock: 0, isActive: false });

    expect((await planImport(db, second)).rows[0].action).toBe("sin-cambios");
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
