import { randomUUID } from "node:crypto";
import { eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { CheckoutInput } from "@/lib/checkout-schema";
import { outfitLineKey } from "@/lib/outfits";
import type { Db } from "../db/client";

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
const { getDb, closeDb } = await import("../db/client");
const schema = await import("../db/schema");
const { placeOrder, changeOrderStatus, getOrderByNumber } = await import("./orders");
const { getProductDetail, listProductCards } = await import("./catalog");
const { getOutfitSnapshots } = await import("./cart");
const { deleteProduct, saveOutfit } = await import("./admin-products");

let db: Db;
const ids = {
  category: randomUUID(),
  outfits: randomUUID(),
  color: randomUUID(),
  beige: randomUUID(),
  m: randomUUID(),
  l: randomUUID(),
  size30: randomUUID(),
  shirt: randomUUID(),
  pants: randomUUID(),
  outfit: randomUUID(),
  shirtM: randomUUID(),
  shirtL: randomUUID(),
  pants30: randomUUID(),
};

function checkout(items: CheckoutInput["items"], n = 0): CheckoutInput {
  return {
    name: "Cliente de prueba",
    phone: "999000000",
    email: `conjunto${n}@example.com`,
    documentType: "dni",
    documentNumber: "00000000",
    invoiceType: "boleta",
    shippingMethod: "recojo-en-tienda",
    paymentMethod: "yape_plin",
    items,
  } as CheckoutInput;
}

const outfitItem = (quantity = 1, variantIds = [ids.shirtM, ids.pants30]) => ({ outfitId: ids.outfit, variantIds, quantity });

async function stocks() {
  const rows = await db
    .select({ id: schema.productVariants.id, stock: schema.productVariants.stock })
    .from(schema.productVariants)
    .where(inArray(schema.productVariants.id, [ids.shirtM, ids.pants30]));
  return Object.fromEntries(rows.map((r) => [r.id === ids.shirtM ? "shirtM" : "pants30", r.stock]));
}

beforeAll(async () => {
  db = getDb();
  await db.execute(sql`TRUNCATE payments, payment_proofs, order_status_history, order_items, orders, customers, promotion_products, promotions,
    outfit_pieces, product_images, product_redirects, product_variants, products, category_fits, categories, fits, colors, sizes,
    districts, shipping_methods CASCADE`);
  await db.insert(schema.categories).values([
    { id: ids.category, slug: "camisa", name: "CAMISA" },
    { id: ids.outfits, slug: "conjuntos", name: "Conjuntos" },
  ]);
  await db.insert(schema.colors).values([
    { id: ids.color, slug: "negro", name: "Negro" },
    { id: ids.beige, slug: "beige", name: "Beige" },
  ]);
  await db.insert(schema.sizes).values([
    { id: ids.m, label: "M" },
    { id: ids.l, label: "L" },
    { id: ids.size30, label: "30" },
  ]);
  await db.insert(schema.products).values([
    { id: ids.shirt, slug: "camisa-lino", name: "Camisa Lino", categoryId: ids.category, status: "active" },
    // En borrador: se vende solo dentro del conjunto.
    { id: ids.pants, slug: "pantalon-lino", name: "Pantalón Lino", categoryId: ids.category, status: "draft" },
    { id: ids.outfit, slug: "conjunto-lino", name: "Conjunto Lino", categoryId: ids.outfits, status: "active", kind: "outfit", outfitPriceCents: 11000 },
  ]);
  await db.insert(schema.productVariants).values([
    { id: ids.shirtM, productId: ids.shirt, sku: "TMW-C-M", colorId: ids.color, sizeId: ids.m, priceCents: 6000, stock: 1 },
    { id: ids.shirtL, productId: ids.shirt, sku: "TMW-C-L", colorId: ids.color, sizeId: ids.l, priceCents: 6000, stock: 0 },
    { id: ids.pants30, productId: ids.pants, sku: "TMW-P-30", colorId: ids.beige, sizeId: ids.size30, priceCents: 7000, stock: 5 },
  ]);
  await db.insert(schema.outfitPieces).values([
    { outfitId: ids.outfit, position: 0, productId: ids.shirt, label: null },
    { outfitId: ids.outfit, position: 1, productId: ids.pants, label: "Pantalón" },
  ]);
  await db.insert(schema.shippingMethods).values({ slug: "recojo-en-tienda", name: "Recojo en tienda", kind: "store_pickup" });
});

beforeEach(async () => {
  await db.execute(sql`TRUNCATE order_status_history, order_items, orders, customers CASCADE`);
  await db.update(schema.productVariants).set({ stock: 1 }).where(eq(schema.productVariants.id, ids.shirtM));
  await db.update(schema.productVariants).set({ stock: 5 }).where(eq(schema.productVariants.id, ids.pants30));
});

afterAll(async () => {
  await closeDb();
});

describe("catálogo", () => {
  it("la ficha del conjunto trae cada pieza con sus tallas y el precio por separado", async () => {
    const detail = await getProductDetail(db, "conjunto-lino");
    expect(detail?.kind).toBe("outfit");
    if (detail?.kind !== "outfit") return;
    expect(detail).toMatchObject({ priceCents: 11000, compareAtPriceCents: 13000 });
    expect(detail.pieces.map((p) => [p.label, p.name, p.soldSeparately, p.sizes.map((s) => s.label)])).toEqual([
      ["Camisa", "Camisa Lino", true, ["M", "L"]],
      ["Pantalón", "Pantalón Lino", false, ["30"]],
    ]);
  });

  it("la tarjeta del conjunto: su precio, las tallas de sus piezas y sin stock si una pieza se agota", async () => {
    const card = (await listProductCards(db)).find((c) => c.slug === "conjunto-lino");
    expect(card).toMatchObject({ priceCents: 11000, compareAtPriceCents: 13000, inStock: true, promotion: null, outfit: { pieceProductIds: [ids.shirt, ids.pants] } });
    expect(card?.sizes).toEqual(["M", "30"]);
    // La prenda en borrador no aparece sola en el catálogo.
    expect((await listProductCards(db)).some((c) => c.slug === "pantalon-lino")).toBe(false);

    await db.update(schema.productVariants).set({ stock: 0 }).where(eq(schema.productVariants.id, ids.shirtM));
    expect((await listProductCards(db)).find((c) => c.slug === "conjunto-lino")?.inStock).toBe(false);
  });
});

describe("pedido con conjunto", () => {
  it("descuenta el stock de cada pieza y guarda una fila por prenda con el precio repartido", async () => {
    const result = await placeOrder(db, checkout([outfitItem()]));
    expect(result).toMatchObject({ ok: true, totalCents: 11000 });
    if (!result.ok) return;
    expect(result.productSlugs.sort()).toEqual(["camisa-lino", "conjunto-lino", "pantalon-lino"]);
    expect(await stocks()).toEqual({ shirtM: 0, pants30: 4 });

    const order = await getOrderByNumber(db, result.number);
    expect(order).toMatchObject({ subtotalCents: 11000, discountCents: 0, totalCents: 11000 });
    const items = order!.items.map((i) => ({ sku: i.sku, unit: i.unitPriceCents, before: i.compareAtPriceCents, outfit: i.outfitName, line: i.outfitLine }));
    expect(items).toEqual(
      expect.arrayContaining([
        { sku: "TMW-C-M", unit: 5077, before: 6000, outfit: "Conjunto Lino", line: 1 },
        { sku: "TMW-P-30", unit: 5923, before: 7000, outfit: "Conjunto Lino", line: 1 },
      ]),
    );

    // Al anular, vuelven las dos prendas al stock.
    await changeOrderStatus(db, { orderId: result.orderId, to: "anulado", userId: null });
    expect(await stocks()).toEqual({ shirtM: 1, pants30: 5 });
  });

  it("el stock es el mismo para el conjunto y la prenda sola: la última unidad se vende una sola vez", async () => {
    const attempts = Array.from({ length: 10 }, (_, i) =>
      placeOrder(db, checkout(i % 2 ? [outfitItem()] : [{ variantId: ids.shirtM, quantity: 1 }], i)),
    );
    const results = await Promise.all(attempts);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect((await stocks()).shirtM).toBe(0);
  });

  it("si el carrito pide más de lo que hay entre la prenda sola y el conjunto, rechaza las dos líneas", async () => {
    const result = await placeOrder(db, checkout([outfitItem(), { variantId: ids.shirtM, quantity: 1 }]));
    expect(result).toMatchObject({ ok: false, code: "out_of_stock" });
    if (result.ok || !("variantIds" in result)) return;
    expect(result.variantIds.sort()).toEqual([outfitLineKey(ids.outfit, [ids.shirtM, ids.pants30]), ids.shirtM].sort());
    expect(await stocks()).toEqual({ shirtM: 1, pants30: 5 });
  });

  it("una variante que no es de su pieza (o en otro orden) no se vende", async () => {
    const swapped = await placeOrder(db, checkout([outfitItem(1, [ids.pants30, ids.shirtM])]));
    expect(swapped).toMatchObject({ ok: false, code: "unavailable" });
    expect(await getOutfitSnapshots(db, [{ outfitId: ids.outfit, variantIds: [ids.pants30, ids.shirtM] }])).toEqual([]);
  });
});

describe("admin", () => {
  it("no deja borrar una prenda que es pieza de un conjunto ni usar un conjunto como pieza", async () => {
    expect(await deleteProduct(db, ids.pants)).toMatchObject({ ok: false });
    expect(await saveOutfit(db, ids.outfit, { priceCents: 11000, pieces: [{ productId: ids.shirt, label: null }, { productId: ids.outfit, label: null }] })).toMatchObject({
      ok: false,
    });
    const saved = await saveOutfit(db, ids.outfit, { priceCents: 10000, pieces: [{ productId: ids.shirt, label: "Camisa" }, { productId: ids.pants, label: "Pantalón" }] });
    expect(saved).toMatchObject({ ok: true });
    // "Camisa" es el nombre de su categoría: no se guarda (sigue a la categoría).
    const pieces = await db.select().from(schema.outfitPieces).where(eq(schema.outfitPieces.outfitId, ids.outfit)).orderBy(schema.outfitPieces.position);
    expect(pieces.map((p) => p.label)).toEqual([null, "Pantalón"]);
    await db.update(schema.products).set({ outfitPriceCents: 11000 }).where(eq(schema.products.id, ids.outfit));
  });
});
