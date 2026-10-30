import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "../db/client";

// El cliente de BD lee DATABASE_URL: se apunta a la BD de tests antes de importarlo.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
const { getDb, closeDb } = await import("../db/client");
const schema = await import("../db/schema");
const { getOnlineWarehouseId, moveStock } = await import("./stock");
const { getPosSale, openCashSession, registerSale, sendToSunat, voidSale } = await import("./pos");
const { registerReturn, sendReturnToSunat } = await import("./pos-returns");
const { getSalesLedger, getSalesReport, getStockValuation } = await import("./reports");
const { reportRange, todayInLima } = await import("@/lib/reports");
type SunatClient = import("./sunat").SunatClient;

let db: Db;
let store: string;
const ids = { category: randomUUID(), product: randomUUID(), color: randomUUID(), size: randomUUID(), variant: randomUUID(), customer: randomUUID() };
const today = () => reportRange(todayInLima(), todayInLima());
const sunat: SunatClient = {
  emit: async () => ({ status: "aceptado", code: "0", message: "aceptada", hash: "h=", ticketUrl: null, pdfUrl: null, xmlUrl: null, cdrUrl: null }),
  voidDocument: async () => ({ status: "PENDIENTE", message: null }),
  lookupRuc: async () => null,
};
const sell = async (overrides: Partial<Parameters<typeof registerSale>[1]>) => {
  const result = await registerSale(
    db,
    {
      warehouseId: store,
      documentType: "nota_venta",
      customer: null,
      lines: [{ variantId: ids.variant, quantity: 1 }],
      manualDiscountCents: 0,
      shippingCents: 0,
      payments: [{ method: "efectivo", amountCents: 9900, receivedCents: 9900, reference: null }],
      note: null,
      ...overrides,
    },
    null,
  );
  if (!result.ok) throw new Error(result.message);
  return result;
};

beforeAll(async () => {
  db = getDb();
  await db.execute(sql`TRUNCATE order_status_history, order_items, orders, customers, promotion_products, promotions, product_images, product_redirects,
    product_variants, products, category_fits, categories, fits, colors, sizes, cash_sessions, document_series RESTART IDENTITY CASCADE`);
  store = await getOnlineWarehouseId(db);
  await db.insert(schema.categories).values({ id: ids.category, slug: "pantalones", name: "Pantalones" });
  await db.insert(schema.colors).values({ id: ids.color, slug: "negro", name: "Negro" });
  await db.insert(schema.sizes).values({ id: ids.size, label: "30" });
  await db.insert(schema.products).values({ id: ids.product, slug: "mom-jean", name: "Mom Jean", categoryId: ids.category, status: "active" });
  await db.insert(schema.productVariants).values({ id: ids.variant, productId: ids.product, sku: "TMW-TEST", colorId: ids.color, sizeId: ids.size, priceCents: 9900, stock: 10 });
  await openCashSession(db, { warehouseId: store, openingCents: 0, userId: null });

  // Tienda: una boleta de 2 con descuento, una nota de venta anulada, otra pagada y la devolución de una prenda de la boleta.
  const boleta = await sell({ documentType: "boleta", lines: [{ variantId: ids.variant, quantity: 2 }], manualDiscountCents: 990, payments: [{ method: "efectivo", amountCents: 18810, receivedCents: 20000, reference: null }] });
  await sendToSunat(db, boleta.saleId, sunat);
  const voided = await sell({ payments: [{ method: "yape", amountCents: 9900, receivedCents: null, reference: "1" }] });
  await voidSale(db, { saleId: voided.saleId, reason: "Error", userId: null });
  await sell({});
  const saleItemId = (await getPosSale(db, boleta.saleId))!.items[0].id;
  const ret = await registerReturn(db, { saleId: boleta.saleId, items: [{ saleItemId, quantity: 1 }], reason: "Talla", refundMethod: "efectivo" }, null);
  if (!ret.ok) throw new Error(ret.message);
  await sendReturnToSunat(db, ret.returnId, sunat);

  // Web: un pedido pagado (con S/ 20 devueltos) y uno pendiente, que no cuenta.
  await db.insert(schema.customers).values({ id: ids.customer, name: "Ana Torres", email: "ana@example.com", phone: "999111222" });
  const order = (status: "pagado" | "pendiente") => ({
    customerId: ids.customer,
    status,
    email: "ana@example.com",
    customerName: "Ana Torres",
    phone: "999111222",
    documentType: "dni" as const,
    documentNumber: "75413811",
    shippingMethodName: "Recojo en tienda",
    shippingKind: "store_pickup" as const,
    paymentMethod: "tarjeta" as const,
    subtotalCents: 15000,
    totalCents: 15000,
  });
  const [paid] = await db.insert(schema.orders).values([order("pagado"), order("pendiente")]).returning({ id: schema.orders.id });
  await db.insert(schema.orderItems).values({
    orderId: paid.id,
    productId: ids.product,
    productName: "Mom Jean",
    productSlug: "mom-jean",
    sku: "TMW-TEST",
    colorName: "Negro",
    sizeLabel: "30",
    unitPriceCents: 15000,
    quantity: 1,
    totalCents: 15000,
  });
  await db.insert(schema.refunds).values({ orderId: paid.id, method: "manual", status: "hecha", amountCents: 2000, reason: "cliente" });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE orders, customers, cash_sessions, document_series, product_variants RESTART IDENTITY CASCADE`);
  await closeDb();
});

describe("getSalesReport", () => {
  it("suma tienda y web sin las anuladas ni los pedidos sin pagar, y resta las devoluciones aparte", async () => {
    const r = await getSalesReport(db, today());
    expect(r.store).toEqual({ count: 2, cents: 18810 + 9900, units: 3, returnsCount: 1, returnsCents: 9405 });
    expect(r.web).toEqual({ count: 1, cents: 15000, units: 1, refundsCount: 1, refundsCents: 2000 });
    expect(r.buckets.at(-1)).toMatchObject({ key: todayInLima(), storeCents: 28710, webCents: 15000, storeCount: 2, webCount: 1 });
    expect([r.storeMethods.efectivo, r.storeMethods.yape, r.storeRefundsByMethod.efectivo]).toEqual([28710, 0, 9405]);
    expect(r.webMethods).toEqual([{ method: "tarjeta", count: 1, cents: 15000 }]);
    expect(r.sellers).toEqual([{ sellerId: null, name: null, count: 2, cents: 28710, units: 3 }]);
    expect(r.documents.find((d) => d.type === "nota_venta")).toMatchObject({ count: 1, voided: 1 });
    expect(r.documents.find((d) => d.type === "boleta")).toMatchObject({ count: 1, cents: 18810, pending: 0 });
    expect(r.creditNotes).toEqual({ count: 1, pending: 0 });
    expect(r.models).toEqual([{ key: ids.product, name: "Mom Jean", storeUnits: 3, webUnits: 1, cents: 19800 + 9900 + 15000 }]);
    expect(r.sizes).toEqual([{ label: "30", units: 4 }]);
  });
});

describe("getSalesLedger", () => {
  it("valor de venta e IGV como en SUNAT, anuladas en cero y devoluciones en negativo", async () => {
    const rows = await getSalesLedger(db, today());
    expect(rows.map((r) => [r.document, r.number, r.reference, r.baseCents, r.igvCents, r.totalCents, r.status])).toEqual([
      ["boleta", "B005-1", null, 15941, 2869, 18810, "pagada"],
      ["nota_venta", "NV05-1", null, null, null, 0, "anulada"],
      ["nota_venta", "NV05-2", null, null, null, 9900, "pagada"],
      ["nota_credito", "BC05-1", "B005-1", -7970, -1435, -9405, "devuelta"],
      ["pedido_web", "#1001", null, null, null, 15000, "pagada"],
      ["devolucion_web", "#1001", "#1001", null, null, -2000, "devuelta"],
    ]);
  });
});

describe("getStockValuation", () => {
  it("a precio de venta y al costo promedio de los ingresos", async () => {
    await db.transaction(async (tx) => {
      await moveStock(tx, [{ variantId: ids.variant, quantity: 5, unitCostCents: 4000 }], { type: "ingreso" });
      await moveStock(tx, [{ variantId: ids.variant, quantity: 5, unitCostCents: 5000 }], { type: "ingreso" });
    });
    // 10 − 2 (boleta) − 1 + 1 (anulada) − 1 + 1 (devuelta) + 10 (ingresos) = 18
    const gamarra = (await getStockValuation(db)).find((w) => w.warehouseId === store);
    expect(gamarra).toMatchObject({ units: 18, priceCents: 18 * 9900, costCents: 18 * 4500, unitsWithoutCost: 0 });
  });
});
