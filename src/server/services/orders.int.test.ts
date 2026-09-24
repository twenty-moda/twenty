import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { CheckoutInput } from "@/lib/checkout-schema";
import type { Db } from "../db/client";

// El cliente de BD lee DATABASE_URL: se apunta a la BD de tests antes de importarlo.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
const { getDb, closeDb } = await import("../db/client");
const schema = await import("../db/schema");
const { placeOrder, changeOrderStatus, getOrderByNumber } = await import("./orders");

let db: Db;
const ids = {
  category: randomUUID(),
  product: randomUUID(),
  color: randomUUID(),
  size: randomUUID(),
  variant: randomUUID(),
  pickup: randomUUID(),
  delivery: randomUUID(),
  promo: randomUUID(),
};

function checkout(overrides: Partial<CheckoutInput> = {}, n = 0): CheckoutInput {
  return {
    name: "Cliente de prueba",
    phone: "999000000",
    email: `test${n}@example.com`,
    documentType: "dni",
    documentNumber: "00000000",
    invoiceType: "boleta",
    shippingMethod: "recojo-en-tienda",
    paymentMethod: "yape_plin",
    items: [{ variantId: ids.variant, quantity: 1 }],
    ...overrides,
  } as CheckoutInput;
}

async function setStock(stock: number) {
  await db.update(schema.productVariants).set({ stock }).where(eq(schema.productVariants.id, ids.variant));
}
async function stock() {
  const [v] = await db.select({ stock: schema.productVariants.stock }).from(schema.productVariants).where(eq(schema.productVariants.id, ids.variant));
  return v.stock;
}

beforeAll(async () => {
  db = getDb();
  await db.execute(sql`TRUNCATE order_status_history, order_items, orders, customers, promotion_products, promotions,
    product_images, product_redirects, product_variants, products, category_fits, categories, fits, colors, sizes,
    districts, shipping_methods CASCADE`);
  await db.insert(schema.categories).values({ id: ids.category, slug: "pantalones", name: "Pantalones" });
  await db.insert(schema.colors).values({ id: ids.color, slug: "negro", name: "Negro" });
  await db.insert(schema.sizes).values({ id: ids.size, label: "30" });
  await db.insert(schema.products).values({ id: ids.product, slug: "mom-jean", name: "Mom Jean", categoryId: ids.category, status: "active" });
  await db.insert(schema.productVariants).values({
    id: ids.variant,
    productId: ids.product,
    sku: "TMW-TEST",
    colorId: ids.color,
    sizeId: ids.size,
    priceCents: 7000,
    stock: 1,
  });
  await db.insert(schema.shippingMethods).values([
    { id: ids.pickup, slug: "recojo-en-tienda", name: "Recojo en tienda", kind: "store_pickup" },
    { id: ids.delivery, slug: "delivery-lima", name: "Delivery Lima", kind: "lima_delivery", position: 1 },
    { id: randomUUID(), slug: "shalom", name: "Envío Shalom", kind: "agency", paymentOnDelivery: true, position: 2 },
  ]);
  await db.insert(schema.districts).values([
    { ubigeo: "140130", name: "Santiago De Surco", province: "Lima", department: "Lima", deliveryPriceCents: 1200 },
    { ubigeo: "040101", name: "Arequipa", province: "Arequipa", department: "Arequipa", deliveryPriceCents: null },
  ]);
});

beforeEach(async () => {
  await db.execute(sql`TRUNCATE order_status_history, order_items, orders, customers, promotion_products, promotions CASCADE`);
  await setStock(1);
});

afterAll(async () => {
  await closeDb();
});

describe("placeOrder", () => {
  it("10 compras simultáneas de la última unidad: solo 1 se vende", async () => {
    const results = await Promise.all(Array.from({ length: 10 }, (_, i) => placeOrder(db, checkout({}, i))));
    const ok = results.filter((r) => r.ok);
    expect(ok).toHaveLength(1);
    expect(results.filter((r) => !r.ok && r.code === "out_of_stock")).toHaveLength(9);
    expect(await stock()).toBe(0);
    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(schema.orders);
    expect(count).toBe(1);
  });

  it("recalcula el precio con la promo y cobra el delivery según el distrito", async () => {
    await setStock(5);
    await db.insert(schema.promotions).values({ id: ids.promo, name: "2 X 100", type: "bundle_price", quantity: 2, bundlePriceCents: 10000 });
    await db.insert(schema.promotionProducts).values({ promotionId: ids.promo, productId: ids.product });

    const result = await placeOrder(
      db,
      checkout({ items: [{ variantId: ids.variant, quantity: 3 }], shippingMethod: "delivery-lima", ubigeo: "140130", address: "Av. Siempre Viva 123" }),
    );
    expect(result).toMatchObject({ ok: true, totalCents: 3 * 5000 + 1200 });
    if (!result.ok) return;
    const order = await getOrderByNumber(db, result.number);
    expect(order).toMatchObject({ subtotalCents: 21000, discountCents: 6000, shippingCents: 1200, district: "Santiago De Surco", status: "pendiente" });
    expect(order?.items[0]).toMatchObject({ sku: "TMW-TEST", colorName: "Negro", sizeLabel: "30", quantity: 3 });
    expect(await stock()).toBe(2);
  });

  it("no ofrece delivery Lima en provincia y pide dirección cuando hay envío", async () => {
    expect(await placeOrder(db, checkout({ shippingMethod: "delivery-lima", ubigeo: "040101", address: "Calle 1" }))).toMatchObject({
      ok: false,
      code: "shipping",
    });
    expect(await placeOrder(db, checkout({ shippingMethod: "delivery-lima", ubigeo: "140130" }))).toMatchObject({ ok: false, code: "address" });
    expect(await stock()).toBe(1);
  });

  it("Shalom pide la agencia de destino y no la dirección", async () => {
    await setStock(2);
    expect(await placeOrder(db, checkout({ shippingMethod: "shalom", ubigeo: "040101" }))).toMatchObject({ ok: false, code: "agency" });
    const result = await placeOrder(db, checkout({ shippingMethod: "shalom", ubigeo: "040101", agencyName: "Shalom Arequipa Centro" }));
    expect(result).toMatchObject({ ok: true, totalCents: 7000 });
    if (!result.ok) return;
    const order = await getOrderByNumber(db, result.number);
    expect(order).toMatchObject({ agencyName: "Shalom Arequipa Centro", address: null, department: "Arequipa", paymentOnDelivery: true });
  });

  it("reutiliza el cliente por email", async () => {
    await setStock(3);
    await placeOrder(db, checkout({ email: "misma@example.com", name: "Ana" }));
    await placeOrder(db, checkout({ email: "misma@example.com", name: "Ana Pérez" }));
    const rows = await db.select().from(schema.customers);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Ana Pérez");
  });
});

describe("changeOrderStatus", () => {
  it("valida el flujo, guarda historial y devuelve el stock una sola vez al anular", async () => {
    await setStock(2);
    const placed = await placeOrder(db, checkout({ items: [{ variantId: ids.variant, quantity: 2 }] }));
    if (!placed.ok) throw new Error("no se creó el pedido");
    expect(await stock()).toBe(0);

    expect(await changeOrderStatus(db, { orderId: placed.orderId, to: "entregado", userId: null })).toMatchObject({ ok: false });
    expect(await changeOrderStatus(db, { orderId: placed.orderId, to: "anulado", note: "Cliente desistió", userId: null })).toMatchObject({
      ok: true,
      restocked: true,
    });
    expect(await stock()).toBe(2);
    // Un estado final no se puede cambiar, así que el stock no se devuelve dos veces.
    expect(await changeOrderStatus(db, { orderId: placed.orderId, to: "rechazado", userId: null })).toMatchObject({ ok: false });
    expect(await stock()).toBe(2);

    const order = await getOrderByNumber(db, placed.number);
    expect(order?.history.map((h) => [h.fromStatus, h.toStatus, h.note])).toEqual([
      [null, "pendiente", "Pedido creado en la web"],
      ["pendiente", "anulado", "Cliente desistió"],
    ]);
  });
});
