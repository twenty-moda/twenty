import { randomUUID } from "node:crypto";
import { and, asc, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { CheckoutInput } from "@/lib/checkout-schema";
import type { Db } from "../db/client";

// El cliente de BD lee DATABASE_URL: se apunta a la BD de tests antes de importarlo.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
const { getDb, closeDb } = await import("../db/client");
const schema = await import("../db/schema");
const { getOnlineWarehouseId, InsufficientStockError, moveStock, setStock } = await import("./stock");
const { changeOrderStatus, placeOrder } = await import("./orders");

let db: Db;
let online: string;
const ids = {
  category: randomUUID(),
  product: randomUUID(),
  color: randomUUID(),
  size: randomUUID(),
  variant: randomUUID(),
  depot: randomUUID(),
};

async function variantStock() {
  const [v] = await db.select({ stock: schema.productVariants.stock }).from(schema.productVariants).where(eq(schema.productVariants.id, ids.variant));
  return v.stock;
}
async function level(warehouseId: string) {
  const [row] = await db
    .select({ quantity: schema.inventoryLevels.quantity })
    .from(schema.inventoryLevels)
    .where(and(eq(schema.inventoryLevels.variantId, ids.variant), eq(schema.inventoryLevels.warehouseId, warehouseId)));
  return row?.quantity ?? null;
}
async function movements() {
  return db
    .select({
      warehouseId: schema.stockMovements.warehouseId,
      type: schema.stockMovements.type,
      quantity: schema.stockMovements.quantity,
      balanceAfter: schema.stockMovements.balanceAfter,
      orderId: schema.stockMovements.orderId,
    })
    .from(schema.stockMovements)
    .where(eq(schema.stockMovements.variantId, ids.variant))
    .orderBy(asc(schema.stockMovements.createdAt));
}

beforeAll(async () => {
  db = getDb();
  await db.execute(sql`TRUNCATE order_status_history, order_items, orders, customers, promotion_products, promotions,
    product_images, product_redirects, product_variants, products, category_fits, categories, fits, colors, sizes,
    districts, shipping_methods CASCADE`);
  online = await getOnlineWarehouseId(db);
  await db.insert(schema.warehouses).values({ id: ids.depot, name: "Depósito de prueba", code: "TST" });
  await db.insert(schema.categories).values({ id: ids.category, slug: "pantalones", name: "Pantalones" });
  await db.insert(schema.colors).values({ id: ids.color, slug: "negro", name: "Negro" });
  await db.insert(schema.sizes).values({ id: ids.size, label: "30" });
  await db.insert(schema.products).values({ id: ids.product, slug: "mom-jean", name: "Mom Jean", categoryId: ids.category, status: "active" });
  await db.insert(schema.shippingMethods).values({ id: randomUUID(), slug: "recojo-en-tienda", name: "Recojo en tienda", kind: "store_pickup" });
});

beforeEach(async () => {
  await db.execute(sql`TRUNCATE order_status_history, order_items, orders, customers, product_variants CASCADE`);
  await db.insert(schema.productVariants).values({
    id: ids.variant,
    productId: ids.product,
    sku: "TMW-TEST",
    colorId: ids.color,
    sizeId: ids.size,
    priceCents: 7000,
    stock: 5,
  });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE product_variants CASCADE`);
  await db.delete(schema.warehouses).where(eq(schema.warehouses.id, ids.depot));
  await closeDb();
});

describe("moveStock", () => {
  it("en el almacén de la web mueve product_variants.stock, su fila de inventario y anota el saldo", async () => {
    await db.transaction((tx) => moveStock(tx, [{ variantId: ids.variant, quantity: -2 }], { type: "ajuste", note: "rotura" }));
    expect(await variantStock()).toBe(3);
    expect(await level(online)).toBe(3);
    expect(await movements()).toEqual([{ warehouseId: online, type: "ajuste", quantity: -2, balanceAfter: 3, orderId: null }]);
  });

  it("en otro almacén entra, sale y nunca queda en negativo (sin tocar el stock de la web)", async () => {
    await db.transaction((tx) => moveStock(tx, [{ variantId: ids.variant, warehouseId: ids.depot, quantity: 4 }], { type: "ingreso", unitCostCents: 3500 }));
    expect(await level(ids.depot)).toBe(4);
    await expect(
      db.transaction((tx) => moveStock(tx, [{ variantId: ids.variant, warehouseId: ids.depot, quantity: -5 }], { type: "ajuste" })),
    ).rejects.toBeInstanceOf(InsufficientStockError);
    expect(await level(ids.depot)).toBe(4);
    expect(await variantStock()).toBe(5);
  });

  it("un traslado sin stock suficiente no mueve ninguna de las dos puntas", async () => {
    await db.transaction((tx) => moveStock(tx, [{ variantId: ids.variant, warehouseId: ids.depot, quantity: 1 }], { type: "ingreso" }));
    const transfer = (quantity: number) =>
      db.transaction(async (tx) => {
        await moveStock(tx, [{ variantId: ids.variant, quantity }], { type: "traslado_entrada" });
        await moveStock(tx, [{ variantId: ids.variant, warehouseId: ids.depot, quantity: -quantity }], { type: "traslado_salida" });
      });
    await expect(transfer(3)).rejects.toBeInstanceOf(InsufficientStockError);
    expect([await variantStock(), await level(ids.depot)]).toEqual([5, 1]);
    await transfer(1);
    expect([await variantStock(), await level(ids.depot)]).toEqual([6, 0]);
  });

  it("10 salidas simultáneas de la última unidad de un almacén: solo 1 pasa", async () => {
    await db.transaction((tx) => moveStock(tx, [{ variantId: ids.variant, warehouseId: ids.depot, quantity: 1 }], { type: "ingreso" }));
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () =>
        db.transaction((tx) => moveStock(tx, [{ variantId: ids.variant, warehouseId: ids.depot, quantity: -1 }], { type: "venta_tienda" })),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected" && r.reason instanceof InsufficientStockError)).toHaveLength(9);
    expect(await level(ids.depot)).toBe(0);
  });
});

describe("setStock", () => {
  it("anota solo la diferencia y nada si el valor no cambia", async () => {
    await db.transaction((tx) => setStock(tx, [{ variantId: ids.variant, quantity: 9 }], { note: "conteo" }));
    await db.transaction((tx) => setStock(tx, [{ variantId: ids.variant, quantity: 9 }], {}));
    expect(await variantStock()).toBe(9);
    expect(await movements()).toEqual([{ warehouseId: online, type: "ajuste", quantity: 4, balanceAfter: 9, orderId: null }]);
  });
});

describe("pedidos de la web", () => {
  const checkout = {
    name: "Cliente de prueba",
    phone: "999000000",
    email: "stock@example.com",
    documentType: "dni",
    documentNumber: "00000000",
    invoiceType: "boleta",
    shippingMethod: "recojo-en-tienda",
    paymentMethod: "yape_plin",
    items: [{ variantId: ids.variant, quantity: 2 }],
  } as CheckoutInput;

  it("la venta queda en el kardex enlazada al pedido y al anularlo vuelve al mismo almacén", async () => {
    const placed = await placeOrder(db, checkout);
    if (!placed.ok) throw new Error(placed.code);
    expect(await variantStock()).toBe(3);
    const cancelled = await changeOrderStatus(db, { orderId: placed.orderId, to: "anulado", note: "El cliente desistió", userId: null });
    expect(cancelled.ok).toBe(true);
    expect(await variantStock()).toBe(5);
    expect(await level(online)).toBe(5);
    expect(await movements()).toEqual([
      { warehouseId: online, type: "venta_web", quantity: -2, balanceAfter: 3, orderId: placed.orderId },
      { warehouseId: online, type: "anulacion_web", quantity: 2, balanceAfter: 5, orderId: placed.orderId },
    ]);
  });
});
