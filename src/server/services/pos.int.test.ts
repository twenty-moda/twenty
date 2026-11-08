import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "../db/client";

// El cliente de BD lee DATABASE_URL: se apunta a la BD de tests antes de importarlo.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
const { getDb, closeDb } = await import("../db/client");
const schema = await import("../db/schema");
const { getOnlineWarehouseId } = await import("./stock");
const { addCashMovement, closeCashSession, getCashSession, getOpenSession, getPosSale, listOpenSessions, openCashSession, registerSale, retryPendingSunat, sendToSunat, voidSale } =
  await import("./pos");
const { registerExpense, voidExpense } = await import("./expenses");
const { getCashReport } = await import("./cash-report");
const { listSaleReturns, registerReturn, retryPendingReturns, sendReturnToSunat } = await import("./pos-returns");
type SunatClient = import("./sunat").SunatClient;

let db: Db;
let store: string;
const ids = { category: randomUUID(), product: randomUUID(), color: randomUUID(), size: randomUUID(), variant: randomUUID(), promo: randomUUID() };

const sale = (overrides: Partial<Parameters<typeof registerSale>[1]> = {}, sellerId: string | null = null) =>
  registerSale(
    db,
    {
      warehouseId: store,
      documentType: "nota_venta",
      customer: null,
      lines: [{ variantId: ids.variant, quantity: 1 }],
      manualDiscountCents: 0,
      shippingCents: 0,
      payments: [{ method: "efectivo", amountCents: 7000, receivedCents: 10000, reference: null }],
      note: null,
      ...overrides,
    },
    sellerId,
  );
async function stock() {
  const [v] = await db.select({ stock: schema.productVariants.stock }).from(schema.productVariants).where(eq(schema.productVariants.id, ids.variant));
  return v.stock;
}

beforeAll(async () => {
  db = getDb();
  await db.execute(sql`TRUNCATE order_status_history, order_items, orders, customers, promotion_products, promotions, product_images, product_redirects,
    product_variants, products, category_fits, categories, fits, colors, sizes CASCADE`);
  store = await getOnlineWarehouseId(db);
  await db.insert(schema.categories).values({ id: ids.category, slug: "pantalones", name: "Pantalones" });
  await db.insert(schema.colors).values({ id: ids.color, slug: "negro", name: "Negro" });
  await db.insert(schema.sizes).values({ id: ids.size, label: "30" });
  await db.insert(schema.products).values({ id: ids.product, slug: "mom-jean", name: "Mom Jean", categoryId: ids.category, status: "active" });
});

beforeEach(async () => {
  await db.execute(sql`TRUNCATE expenses, cash_sessions, document_series, promotion_products, promotions, product_variants RESTART IDENTITY CASCADE`);
  await db.insert(schema.productVariants).values({ id: ids.variant, productId: ids.product, sku: "TMW-TEST", colorId: ids.color, sizeId: ids.size, priceCents: 7000, stock: 3 });
  await openCashSession(db, { warehouseId: store, openingCents: 10000, userId: null });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE cash_sessions, document_series, product_variants RESTART IDENTITY CASCADE`);
  await closeDb();
});

describe("registerSale", () => {
  it("cobra en efectivo con vuelto, numera NV05-1, descuenta el stock de la tienda y lo anota en el kardex", async () => {
    const result = await sale();
    expect(result).toMatchObject({ ok: true, series: "NV05", number: 1, totalCents: 7000, changeCents: 3000, productSlugs: ["mom-jean"] });
    if (!result.ok) return;
    expect(await stock()).toBe(2);
    const detail = await getPosSale(db, result.saleId);
    expect(detail?.payments.map((p) => [p.method, p.amountCents, p.receivedCents])).toEqual([["efectivo", 7000, 10000]]);
    const [movement] = await db.select().from(schema.stockMovements).where(and(eq(schema.stockMovements.posSaleId, result.saleId), eq(schema.stockMovements.type, "venta_tienda")));
    expect([movement.quantity, movement.balanceAfter, movement.warehouseId]).toEqual([-1, 2, store]);
  });

  it("aplica las mismas promos de la web (2 x S/ 100) y el descuento y el envío de la tienda", async () => {
    await db.insert(schema.promotions).values({ id: ids.promo, name: "2 X 100", type: "bundle_price", quantity: 2, bundlePriceCents: 10000 });
    await db.insert(schema.promotionProducts).values({ promotionId: ids.promo, productId: ids.product });
    const result = await sale({
      lines: [{ variantId: ids.variant, quantity: 2 }],
      manualDiscountCents: 500,
      shippingCents: 1000,
      payments: [
        { method: "yape", amountCents: 5000, receivedCents: null, reference: "778899" },
        { method: "efectivo", amountCents: 5500, receivedCents: 5500, reference: null },
      ],
    });
    expect(result).toMatchObject({ ok: true, totalCents: 10500, changeCents: 0 });
    if (!result.ok) return;
    const detail = await getPosSale(db, result.saleId);
    expect([detail?.subtotalCents, detail?.promoDiscountCents, detail?.items[0].promotionName]).toEqual([14000, 4000, "2 X 100"]);
  });

  it("sin caja abierta no vende", async () => {
    const session = await getOpenSession(db, store, null);
    await closeCashSession(db, { sessionId: session!.id, countedCashCents: 10000, note: null, userId: null });
    expect(await sale()).toEqual({ ok: false, message: "Tu caja en esta tienda está cerrada. Ábrela para vender." });
  });

  it("si no hay stock no vende nada ni gasta un número", async () => {
    expect((await sale()).ok).toBe(true);
    const failed = await sale({ lines: [{ variantId: ids.variant, quantity: 5 }], payments: [{ method: "tarjeta", amountCents: 35000, receivedCents: null, reference: null }] });
    expect(failed).toEqual({ ok: false, message: "No hay stock de TMW-TEST en Tienda Gamarra. Revisa el inventario.", variantId: ids.variant });
    expect(await stock()).toBe(2);
    expect(await sale()).toMatchObject({ ok: true, number: 2 });
  });

  it("los pagos tienen que cuadrar con el total que calcula el servidor", async () => {
    const result = await sale({ payments: [{ method: "tarjeta", amountCents: 6000, receivedCents: null, reference: null }] });
    expect(result).toEqual({ ok: false, message: "Los pagos suman S/ 60 y el total es S/ 70." });
    expect(await stock()).toBe(3);
  });

  it("5 ventas a la vez de la última unidad: solo 1 pasa y la numeración no salta", async () => {
    await db.update(schema.productVariants).set({ stock: 1 }).where(eq(schema.productVariants.id, ids.variant));
    const results = await Promise.all(Array.from({ length: 5 }, () => sale()));
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await stock()).toBe(0);
    await db.update(schema.productVariants).set({ stock: 1 }).where(eq(schema.productVariants.id, ids.variant));
    expect(await sale()).toMatchObject({ ok: true, number: 2 });
  });
});

type Emitted = { payload: Record<string, unknown>; key: string };
const fakeSunat = (emitImpl?: SunatClient["emit"]) => {
  const calls = { emit: [] as Emitted[], void: [] as unknown[] };
  const client: SunatClient = {
    emit: async (payload, key) => {
      calls.emit.push({ payload, key });
      if (emitImpl) return emitImpl(payload, key);
      return { status: "aceptado", code: "0", message: "La Boleta numero B005-1, ha sido aceptada", hash: "h=", ticketUrl: "https://api/t.pdf", pdfUrl: "https://api/a4.pdf", xmlUrl: "https://api/x.xml", cdrUrl: "https://api/r.xml" };
    },
    voidDocument: async (input) => {
      calls.void.push(input);
      return { status: "PENDIENTE", message: null };
    },
    lookupRuc: async () => null,
  };
  return { client, calls };
};

describe("boleta y factura (SUNAT)", () => {
  it("la boleta se guarda pendiente, sale a SUNAT con la Idempotency-Key de la venta y queda aceptada con sus enlaces", async () => {
    const result = await sale({ documentType: "boleta" });
    expect(result).toMatchObject({ ok: true, series: "B005", number: 1 });
    if (!result.ok) return;
    expect((await getPosSale(db, result.saleId))?.sunatStatus).toBe("pendiente");

    const { client, calls } = fakeSunat();
    expect(await sendToSunat(db, result.saleId, client)).toEqual({ status: "aceptado", message: "La Boleta numero B005-1, ha sido aceptada" });
    expect(calls.emit).toHaveLength(1);
    expect(calls.emit[0].key).toBe(result.saleId);
    expect(calls.emit[0].payload).toMatchObject({ documento: "boleta", serie: "B005", numero: 1, cliente_tipo_de_documento: "-", total: "70.00" });
    const detail = await getPosSale(db, result.saleId);
    expect([detail?.sunatStatus, detail?.sunatTicketUrl, detail?.sunatHash]).toEqual(["aceptado", "https://api/t.pdf", "h="]);
    // Ya aceptada: no se vuelve a mandar.
    await sendToSunat(db, result.saleId, client);
    expect(calls.emit).toHaveLength(1);
  });

  it("si SUNAT no responde queda pendiente con el motivo y el reintento usa la misma clave", async () => {
    const result = await sale({ documentType: "boleta" });
    if (!result.ok) throw new Error("venta");
    const down = fakeSunat(async () => {
      throw new TypeError("fetch failed");
    });
    expect(await sendToSunat(db, result.saleId, down.client)).toEqual({ status: "pendiente", message: "No hubo respuesta de SUNAT: se puede reintentar." });
    const up = fakeSunat();
    expect((await sendToSunat(db, result.saleId, up.client)).status).toBe("aceptado");
    expect([down.calls.emit[0].key, up.calls.emit[0].key]).toEqual([result.saleId, result.saleId]);
    // Sin la API configurada, la venta no se pierde: queda pendiente.
    const other = await sale({ documentType: "boleta" });
    if (!other.ok) throw new Error("venta");
    expect((await sendToSunat(db, other.saleId, null)).status).toBe("pendiente");
  });

  it("las pendientes se reintentan solas (después de una venta y en el cron), de la más antigua a la más nueva", async () => {
    const a = await sale({ documentType: "boleta" });
    const b = await sale({ documentType: "boleta" });
    if (!a.ok || !b.ok) throw new Error("venta");
    expect(await retryPendingSunat(db, null)).toEqual({ checked: 0, accepted: 0 });
    const { client, calls } = fakeSunat();
    expect(await retryPendingSunat(db, client, { skip: b.saleId })).toEqual({ checked: 1, accepted: 1 });
    expect(await retryPendingSunat(db, client)).toEqual({ checked: 1, accepted: 1 });
    expect(calls.emit.map((c) => c.key)).toEqual([a.saleId, b.saleId]);
    expect(await retryPendingSunat(db, client)).toEqual({ checked: 0, accepted: 0 });
  });

  it("factura sin RUC y boleta desde S/ 700 sin cliente no se emiten", async () => {
    expect(await sale({ documentType: "factura" })).toEqual({ ok: false, message: "Para una factura hace falta el RUC y la razón social del cliente." });
    await db.update(schema.productVariants).set({ priceCents: 70000 }).where(eq(schema.productVariants.id, ids.variant));
    const big = await sale({ documentType: "boleta", payments: [{ method: "tarjeta", amountCents: 70000, receivedCents: null, reference: null }] });
    expect(big).toEqual({ ok: false, message: "Una boleta desde S/ 700 lleva el documento y el nombre del cliente." });
    expect(await stock()).toBe(3);
  });

  it("anular una boleta aceptada pide la baja a SUNAT; una pendiente no se anula hasta tener respuesta", async () => {
    const accepted = await sale({ documentType: "boleta" });
    const pending = await sale({ documentType: "boleta" });
    if (!accepted.ok || !pending.ok) throw new Error("venta");
    const { client, calls } = fakeSunat();
    await sendToSunat(db, accepted.saleId, client);

    expect(await voidSale(db, { saleId: pending.saleId, reason: "Error de talla", userId: null }, client)).toEqual({
      ok: false,
      message: "El comprobante todavía no tiene respuesta de SUNAT: reintenta el envío antes de anular.",
    });
    expect((await voidSale(db, { saleId: accepted.saleId, reason: "Error de talla", userId: null }, client)).ok).toBe(true);
    expect(calls.void).toEqual([{ documento: "boleta", serie: "B005", numero: 1, motivo: "Error de talla" }]);
    const detail = await getPosSale(db, accepted.saleId);
    expect([detail?.status, detail?.sunatVoidStatus]).toEqual(["anulada", "PENDIENTE"]);
  });
});

describe("caja", () => {
  it("no abre dos cajas en la misma tienda", async () => {
    expect(await openCashSession(db, { warehouseId: store, openingCents: 0, userId: null })).toEqual({ ok: false, message: "Ya tienes una caja abierta en esta tienda." });
  });

  it("anular devuelve el stock y la saca de los totales; el arqueo cuenta inicial + efectivo + ingresos − egresos", async () => {
    const session = (await getOpenSession(db, store, null))!;
    const kept = await sale();
    const voided = await sale({ payments: [{ method: "plin", amountCents: 7000, receivedCents: null, reference: null }] });
    if (!kept.ok || !voided.ok) throw new Error("venta");
    expect(await voidSale(db, { saleId: voided.saleId, reason: "Se equivocó de talla", userId: null })).toEqual({ ok: true, productSlugs: ["mom-jean"] });
    expect(await stock()).toBe(2);
    await addCashMovement(db, session.id, { type: "ingreso", amountCents: 500, note: "Sencillo" }, null);
    await addCashMovement(db, session.id, { type: "egreso", amountCents: 2000, note: "Pago de movilidad" }, null);

    const closed = await closeCashSession(db, { sessionId: session.id, countedCashCents: 15500, note: "Cuadró", userId: null });
    expect(closed).toEqual({ ok: true, expectedCashCents: 10000 + 7000 + 500 - 2000 });
    const detail = await getCashSession(db, session.number);
    expect([detail?.totals.salesCount, detail?.totals.voidedCount, detail?.totals.methods.plin, detail?.countedCashCents]).toEqual([1, 1, 0, 15500]);
    expect(await voidSale(db, { saleId: kept.saleId, reason: "tarde", userId: null })).toMatchObject({ ok: false });
  });
});

describe("caja de cada vendedor", () => {
  const seller = async (name: string, role: "vendedor" | "vendedor_virtual" | "admin" = "vendedor") => {
    const [user] = await db
      .insert(schema.users)
      .values({ name, username: `${name.toLowerCase()}-${randomUUID().slice(0, 8)}`, role })
      .returning({ id: schema.users.id });
    return user.id;
  };

  it("cada vendedor abre la suya y vende en ella; sin caja abierta no vende", async () => {
    const ana = await seller("Ana");
    const luis = await seller("Luis", "vendedor_virtual");
    expect(await openCashSession(db, { warehouseId: store, openingCents: 2000, userId: ana })).toMatchObject({ ok: true });
    expect(await openCashSession(db, { warehouseId: store, openingCents: 0, userId: ana })).toEqual({ ok: false, message: "Ya tienes una caja abierta en esta tienda." });
    expect(await sale({}, luis)).toEqual({ ok: false, message: "Tu caja en esta tienda está cerrada. Ábrela para vender." });
    await openCashSession(db, { warehouseId: store, openingCents: 0, userId: luis });

    const byAna = await sale({}, ana);
    const byLuis = await sale({ payments: [{ method: "yape", amountCents: 7000, receivedCents: null, reference: "123" }] }, luis);
    if (!byAna.ok || !byLuis.ok) throw new Error("venta");
    const anaCaja = (await getOpenSession(db, store, ana))!;
    const luisCaja = (await getOpenSession(db, store, luis))!;
    expect((await getPosSale(db, byAna.saleId))?.cashSessionId).toBe(anaCaja.id);
    expect((await getPosSale(db, byLuis.saleId))?.cashSessionId).toBe(luisCaja.id);
    expect((await getCashSession(db, anaCaja.number))!.expectedNowCents).toBe(2000 + 7000);
    expect((await getCashSession(db, luisCaja.number))!.totals.methods.yape).toBe(7000);
    // La del beforeEach (sin dueño) + la de Ana + la de Luis.
    expect((await listOpenSessions(db, store)).length).toBe(3);
  });

  it("un gasto en efectivo sale del arqueo de su caja; anulado, vuelve; con la caja cerrada ya no se anula", async () => {
    const ana = await seller("Ana");
    const otro = await seller("Otro");
    await openCashSession(db, { warehouseId: store, openingCents: 10000, userId: ana });
    const caja = (await getOpenSession(db, store, ana))!;
    const gasto = { warehouseId: store, fromCash: true, paymentMethod: "efectivo" as const, category: "adelanto" as const, description: "Adelanto Héctor", amountCents: 5000 };

    expect(await registerExpense(db, { ...gasto, paymentMethod: "yape" }, { id: ana, role: "vendedor" })).toMatchObject({ ok: false, message: "Lo que sale de la caja es en efectivo." });
    expect(await registerExpense(db, gasto, { id: otro, role: "vendedor" })).toMatchObject({ ok: false });
    expect(await registerExpense(db, { ...gasto, cashSessionId: caja.id }, { id: otro, role: "vendedor" })).toMatchObject({ ok: false, message: "Solo puedes anotar gastos en tu caja." });
    const first = await registerExpense(db, gasto, { id: ana, role: "vendedor" });
    expect(first).toMatchObject({ ok: true, cashSessionNumber: caja.number });
    await registerExpense(db, { ...gasto, description: "Poet", category: "varios", amountCents: 1790 }, { id: ana, role: "vendedor" });
    // Pagado por Yape: queda en el listado, no en la caja.
    expect(await registerExpense(db, { ...gasto, fromCash: false, paymentMethod: "yape", description: "Estampado", category: "produccion", amountCents: 50000 }, { id: ana, role: "vendedor" })).toMatchObject({
      ok: true,
      cashSessionNumber: null,
    });

    let detail = (await getCashSession(db, caja.number))!;
    expect([detail.totals.expensesCount, detail.totals.expensesCents, detail.expectedNowCents]).toEqual([2, 6790, 10000 - 6790]);
    const [poet] = detail.expenses.filter((e) => e.description === "Poet");
    expect(await voidExpense(db, { expenseId: poet.id, reason: "Lo pagó la dueña" }, { id: otro, role: "vendedor" })).toMatchObject({ ok: false });
    expect(await voidExpense(db, { expenseId: poet.id, reason: "Lo pagó la dueña" }, { id: ana, role: "vendedor" })).toEqual({ ok: true });
    detail = (await getCashSession(db, caja.number))!;
    expect(detail.expectedNowCents).toBe(10000 - 5000);

    const closed = await closeCashSession(db, { sessionId: caja.id, countedCashCents: 5000, note: null, userId: ana });
    expect(closed).toEqual({ ok: true, expectedCashCents: 5000 });
    const [adelanto] = detail.expenses.filter((e) => e.description === "Adelanto Héctor");
    expect(await voidExpense(db, { expenseId: adelanto.id, reason: "error" }, { id: ana, role: "admin" })).toEqual({ ok: false, message: "La caja de ese gasto ya se cerró: su arqueo no cambia." });
    expect(await registerExpense(db, { ...gasto, cashSessionId: caja.id }, { id: ana, role: "vendedor" })).toMatchObject({ ok: false, message: "Esa caja ya está cerrada." });
  });

  it("una venta virtual queda marcada y sale así en el reporte de caja", async () => {
    const luis = await seller("Luis", "vendedor_virtual");
    await openCashSession(db, { warehouseId: store, openingCents: 0, userId: luis });
    const sold = await sale({ channel: "virtual", payments: [{ method: "yape", amountCents: 7000, receivedCents: null, reference: null }] }, luis);
    if (!sold.ok) throw new Error("venta");
    expect((await getPosSale(db, sold.saleId))?.channel).toBe("virtual");
    const caja = (await getOpenSession(db, store, luis))!;
    const report = (await getCashReport(db, caja.number))!;
    expect(report.lines.map((l) => [l.kind, l.cents])).toEqual([["virtual", 7000]]);
    // Sin decir nada, la venta es de tienda.
    const plain = await sale({}, null);
    if (!plain.ok) throw new Error("venta");
    expect((await getPosSale(db, plain.saleId))?.channel).toBe("tienda");
  });

  it("una devolución con varias cajas abiertas sale de la de quien devuelve o de la elegida", async () => {
    const ana = await seller("Ana");
    const jefa = await seller("Jefa", "admin");
    await openCashSession(db, { warehouseId: store, openingCents: 0, userId: ana });
    const sold = await sale({}, ana);
    if (!sold.ok) throw new Error("venta");
    const item = (await getPosSale(db, sold.saleId))!.items[0].id;
    const ret = (cashSessionId?: string) => registerReturn(db, { saleId: sold.saleId, items: [{ saleItemId: item, quantity: 1 }], reason: "Talla", refundMethod: "efectivo", cashSessionId }, jefa);
    // La jefa no tiene caja y hay dos abiertas (la del beforeEach y la de Ana): tiene que elegir.
    expect(await ret()).toEqual({ ok: false, message: "Elige de qué caja sale el dinero." });
    const anaCaja = (await getOpenSession(db, store, ana))!;
    expect((await ret(anaCaja.id)).ok).toBe(true);
    expect((await getCashSession(db, anaCaja.number))!.totals.refundsCents).toBe(7000);
  });
});

describe("devoluciones", () => {
  const giveBack = (saleId: string, saleItemId: string, quantity: number, refundMethod: "efectivo" | "yape" = "efectivo") =>
    registerReturn(db, { saleId, items: [{ saleItemId, quantity }], reason: "No le quedó la talla", refundMethod }, null);
  const itemId = async (saleId: string) => (await getPosSale(db, saleId))!.items[0].id;

  it("devuelve lo pagado (con el descuento repartido), vuelve al stock y sale del efectivo de la caja", async () => {
    const session = (await getOpenSession(db, store, null))!;
    const sold = await sale({ lines: [{ variantId: ids.variant, quantity: 3 }], manualDiscountCents: 1000, payments: [{ method: "efectivo", amountCents: 20000, receivedCents: 20000, reference: null }] });
    if (!sold.ok) throw new Error("venta");
    const item = await itemId(sold.saleId);
    expect(await stock()).toBe(0);

    expect(await giveBack(sold.saleId, item, 1)).toMatchObject({ ok: true, refundCents: 6667, creditNote: null, productSlugs: ["mom-jean"] });
    expect(await stock()).toBe(1);
    const [movement] = await db.select().from(schema.stockMovements).where(and(eq(schema.stockMovements.posSaleId, sold.saleId), eq(schema.stockMovements.type, "devolucion_cliente")));
    expect([movement.quantity, movement.balanceAfter]).toEqual([1, 1]);

    expect(await giveBack(sold.saleId, item, 3)).toEqual({ ok: false, message: "De TMW-TEST solo quedan 2 por devolver." });
    // Las dos últimas se llevan el resto: en total vuelve exacto lo cobrado.
    expect(await giveBack(sold.saleId, item, 2)).toMatchObject({ ok: true, refundCents: 13333 });
    expect(await giveBack(sold.saleId, item, 1)).toEqual({ ok: false, message: "De TMW-TEST ya se devolvió todo." });
    expect((await listSaleReturns(db, sold.saleId)).map((r) => [r.reasonCode, r.refundCents, r.items[0].quantity])).toEqual([
      ["07", 6667, 1],
      ["07", 13333, 2],
    ]);

    const detail = (await getCashSession(db, session.number))!;
    expect([detail.totals.refundsCount, detail.totals.refundsCents, detail.totals.refundsByMethod.efectivo]).toEqual([2, 20000, 20000]);
    expect(detail.expectedNowCents).toBe(10000);
    // Con devoluciones ya no se anula: se devolvería dos veces al stock.
    expect(await voidSale(db, { saleId: sold.saleId, reason: "Error", userId: null })).toMatchObject({ ok: false });
  });

  it("boleta aceptada: la devolución lleva su nota de crédito BC05 contra la boleta, que sale a SUNAT con su propia clave", async () => {
    const sold = await sale({ documentType: "boleta" });
    if (!sold.ok) throw new Error("venta");
    const item = await itemId(sold.saleId);
    expect(await giveBack(sold.saleId, item, 1)).toEqual({ ok: false, message: "El comprobante todavía no tiene respuesta de SUNAT: reintenta el envío antes de devolver." });
    const { client, calls } = fakeSunat();
    await sendToSunat(db, sold.saleId, client);

    const ret = await giveBack(sold.saleId, item, 1, "yape");
    expect(ret).toMatchObject({ ok: true, refundCents: 7000, creditNote: { series: "BC05", number: 1 } });
    if (!ret.ok) return;
    expect((await listSaleReturns(db, sold.saleId))[0]).toMatchObject({ reasonCode: "06", sunatStatus: "pendiente", refundMethod: "yape" });

    expect(await sendReturnToSunat(db, ret.returnId, client)).toMatchObject({ status: "aceptado" });
    expect(calls.emit[1].key).toBe(ret.returnId);
    expect(calls.emit[1].payload).toMatchObject({
      documento: "nota_credito",
      serie: "BC05",
      numero: 1,
      documento_afectado: { documento: "boleta", serie: "B005", numero: 1 },
      nota_credito_codigo_tipo: "06",
      nota_credito_motivo: "No le quedó la talla",
      total: "70.00",
    });
    expect(await retryPendingReturns(db, client)).toEqual({ checked: 0, accepted: 0 });
  });

  it("con la caja de la venta cerrada, el dinero sale de la caja abierta del día", async () => {
    const first = (await getOpenSession(db, store, null))!;
    const sold = await sale();
    if (!sold.ok) throw new Error("venta");
    await closeCashSession(db, { sessionId: first.id, countedCashCents: 17000, note: null, userId: null });
    const item = await itemId(sold.saleId);
    expect(await giveBack(sold.saleId, item, 1)).toEqual({ ok: false, message: "No hay ninguna caja abierta en la tienda: abre la tuya para devolver el dinero." });

    await openCashSession(db, { warehouseId: store, openingCents: 5000, userId: null });
    const today = (await getOpenSession(db, store, null))!;
    expect((await giveBack(sold.saleId, item, 1)).ok).toBe(true);
    expect((await getCashSession(db, today.number))!.expectedNowCents).toBe(5000 - 7000);
    expect((await getCashSession(db, first.number))!.totals.refundsCount).toBe(0);
  });
});
