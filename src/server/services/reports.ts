/**
 * Reportes del panel: ventas de la tienda (punto de venta) y de la web por día, medio de pago, vendedor y comprobante;
 * lo más vendido; el stock valorizado y el registro de ventas para el contador.
 *
 * Una venta cuenta el día que se hizo; una devolución, el día que se devolvió (como la nota de crédito en SUNAT). Las
 * ventas anuladas no suman; de la web cuentan los pedidos pagados, igual que en el Resumen.
 */
import { and, asc, eq, gt, gte, inArray, isNotNull, lt, sql, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { PAID_STATUSES } from "@/lib/order-status";
import { igvSplit, netLineTotals, PAYMENT_METHODS, type PaymentMethod } from "@/lib/pos";
import { bucketKeys, bucketUnit, type ReportRange } from "@/lib/reports";
import type { Db } from "../db/client";
import {
  inventoryLevels,
  orderItems,
  orders,
  posPayments,
  posReturnItems,
  posReturns,
  posSaleItems,
  posSales,
  productVariants,
  refunds,
  stockMovements,
  users,
  warehouses,
} from "../db/schema";

const count = () => sql<number>`count(*)::int`;
const sumInt = (column: PgColumn | SQL) => sql<number>`coalesce(sum(${column}), 0)::int`;
const inRange = (column: PgColumn, range: ReportRange) => and(gte(column, range.from), lt(column, range.to));
/** Día ("2026-10-30") o mes ("2026-10") de Lima. El formato va literal: con un parámetro, el GROUP BY no lo reconoce. */
const bucketOf = (column: PgColumn, unit: "day" | "month") => sql<string>`to_char(${column} at time zone 'America/Lima', ${sql.raw(unit === "day" ? "'YYYY-MM-DD'" : "'YYYY-MM'")})`;

export async function getSalesReport(db: Db, range: ReportRange) {
  const unit = bucketUnit(range);
  const storePaid = and(eq(posSales.status, "pagada"), inRange(posSales.createdAt, range));
  const webPaid = and(inArray(orders.status, PAID_STATUSES), inRange(orders.createdAt, range));
  const storeBucket = bucketOf(posSales.createdAt, unit);
  const webBucket = bucketOf(orders.createdAt, unit);
  const garment = { productId: sql<string | null>`${posSaleItems.productId}::text`, productName: posSaleItems.productName, colorName: posSaleItems.colorName, sizeLabel: posSaleItems.sizeLabel };
  const webGarment = { productId: sql<string | null>`${orderItems.productId}::text`, productName: orderItems.productName, colorName: orderItems.colorName, sizeLabel: orderItems.sizeLabel };

  const [storeBuckets, webBuckets, storeMethods, webMethods, sellers, sellerUnits, documents, returns, [webRefunds], storeItems, webItems] = await Promise.all([
    db.select({ bucket: storeBucket, count: count(), cents: sumInt(posSales.totalCents) }).from(posSales).where(storePaid).groupBy(storeBucket),
    db.select({ bucket: webBucket, count: count(), cents: sumInt(orders.totalCents) }).from(orders).where(webPaid).groupBy(webBucket),
    db
      .select({ method: posPayments.method, cents: sumInt(posPayments.amountCents) })
      .from(posPayments)
      .innerJoin(posSales, eq(posSales.id, posPayments.saleId))
      .where(storePaid)
      .groupBy(posPayments.method),
    db.select({ method: orders.paymentMethod, count: count(), cents: sumInt(orders.totalCents) }).from(orders).where(webPaid).groupBy(orders.paymentMethod),
    db
      .select({ sellerId: posSales.sellerId, name: users.name, count: count(), cents: sumInt(posSales.totalCents) })
      .from(posSales)
      .leftJoin(users, eq(users.id, posSales.sellerId))
      .where(storePaid)
      .groupBy(posSales.sellerId, users.name),
    db
      .select({ sellerId: posSales.sellerId, units: sumInt(posSaleItems.quantity) })
      .from(posSaleItems)
      .innerJoin(posSales, eq(posSales.id, posSaleItems.saleId))
      .where(storePaid)
      .groupBy(posSales.sellerId),
    db
      .select({
        type: posSales.documentType,
        count: sql<number>`count(*) filter (where ${posSales.status} = 'pagada')::int`,
        cents: sql<number>`coalesce(sum(${posSales.totalCents}) filter (where ${posSales.status} = 'pagada'), 0)::int`,
        voided: sql<number>`count(*) filter (where ${posSales.status} = 'anulada')::int`,
        pending: sql<number>`count(*) filter (where ${posSales.status} = 'pagada' and ${posSales.sunatStatus} = 'pendiente')::int`,
        rejected: sql<number>`count(*) filter (where ${posSales.status} = 'pagada' and ${posSales.sunatStatus} = 'rechazado')::int`,
      })
      .from(posSales)
      .where(inRange(posSales.createdAt, range))
      .groupBy(posSales.documentType),
    db
      .select({
        method: posReturns.refundMethod,
        count: count(),
        cents: sumInt(posReturns.refundCents),
        creditNotes: sql<number>`count(${posReturns.creditNoteSeries})::int`,
        pending: sql<number>`count(*) filter (where ${posReturns.sunatStatus} = 'pendiente')::int`,
      })
      .from(posReturns)
      .where(inRange(posReturns.createdAt, range))
      .groupBy(posReturns.refundMethod),
    // Lo devuelto en la web en estas fechas, de pedidos que siguen contando como venta (un anulado ya no suma).
    db
      .select({ count: count(), cents: sumInt(refunds.amountCents) })
      .from(refunds)
      .innerJoin(orders, eq(orders.id, refunds.orderId))
      .where(and(inArray(orders.status, PAID_STATUSES), inRange(refunds.createdAt, range))),
    db
      .select({ ...garment, units: sumInt(posSaleItems.quantity), cents: sumInt(posSaleItems.totalCents) })
      .from(posSaleItems)
      .innerJoin(posSales, eq(posSales.id, posSaleItems.saleId))
      .where(storePaid)
      .groupBy(posSaleItems.productId, posSaleItems.productName, posSaleItems.colorName, posSaleItems.sizeLabel),
    db
      .select({ ...webGarment, units: sumInt(orderItems.quantity), cents: sumInt(orderItems.totalCents) })
      .from(orderItems)
      .innerJoin(orders, eq(orders.id, orderItems.orderId))
      .where(webPaid)
      .groupBy(orderItems.productId, orderItems.productName, orderItems.colorName, orderItems.sizeLabel),
  ]);

  const sum = <T>(rows: T[], pick: (r: T) => number) => rows.reduce((s, r) => s + pick(r), 0);
  const byBucket = (rows: { bucket: string; count: number; cents: number }[]) => new Map(rows.map((r) => [r.bucket, r]));
  const store = byBucket(storeBuckets);
  const web = byBucket(webBuckets);
  const buckets = bucketKeys(range).map((key) => ({
    key,
    storeCents: store.get(key)?.cents ?? 0,
    webCents: web.get(key)?.cents ?? 0,
    storeCount: store.get(key)?.count ?? 0,
    webCount: web.get(key)?.count ?? 0,
  }));

  // Lo más vendido: por modelo (las dos ventas juntas), por talla y por color.
  type Model = { key: string; name: string; storeUnits: number; webUnits: number; cents: number };
  const models = new Map<string, Model>();
  const sizes = new Map<string, number>();
  const colors = new Map<string, number>();
  for (const [rows, channel] of [
    [storeItems, "store"],
    [webItems, "web"],
  ] as const) {
    for (const r of rows) {
      const key = r.productId ?? r.productName;
      const model = models.get(key) ?? { key, name: r.productName, storeUnits: 0, webUnits: 0, cents: 0 };
      if (channel === "store") model.storeUnits += r.units;
      else model.webUnits += r.units;
      model.cents += r.cents;
      models.set(key, model);
      sizes.set(r.sizeLabel, (sizes.get(r.sizeLabel) ?? 0) + r.units);
      colors.set(r.colorName, (colors.get(r.colorName) ?? 0) + r.units);
    }
  }
  const ranked = (m: Map<string, number>) => [...m].map(([label, units]) => ({ label, units })).sort((a, b) => b.units - a.units || a.label.localeCompare(b.label, "es"));
  const unitsBySeller = new Map(sellerUnits.map((s) => [s.sellerId, s.units]));

  return {
    unit,
    buckets,
    store: {
      count: sum(storeBuckets, (r) => r.count),
      cents: sum(storeBuckets, (r) => r.cents),
      units: sum(storeItems, (r) => r.units),
      returnsCount: sum(returns, (r) => r.count),
      returnsCents: sum(returns, (r) => r.cents),
    },
    web: {
      count: sum(webBuckets, (r) => r.count),
      cents: sum(webBuckets, (r) => r.cents),
      units: sum(webItems, (r) => r.units),
      refundsCount: webRefunds.count,
      refundsCents: webRefunds.cents,
    },
    storeMethods: Object.fromEntries(PAYMENT_METHODS.map((m) => [m, storeMethods.find((r) => r.method === m)?.cents ?? 0])) as Record<PaymentMethod, number>,
    storeRefundsByMethod: Object.fromEntries(PAYMENT_METHODS.map((m) => [m, returns.find((r) => r.method === m)?.cents ?? 0])) as Record<PaymentMethod, number>,
    webMethods: webMethods.sort((a, b) => b.cents - a.cents),
    sellers: sellers.map((s) => ({ ...s, units: unitsBySeller.get(s.sellerId) ?? 0 })).sort((a, b) => b.cents - a.cents),
    documents,
    creditNotes: { count: sum(returns, (r) => r.creditNotes), pending: sum(returns, (r) => r.pending) },
    models: [...models.values()].sort((a, b) => b.storeUnits + b.webUnits - (a.storeUnits + a.webUnits) || b.cents - a.cents),
    sizes: ranked(sizes),
    colors: ranked(colors),
  };
}
export type SalesReport = Awaited<ReturnType<typeof getSalesReport>>;

/**
 * Stock de hoy por almacén: unidades, lo que vale a precio de venta y al costo. El costo de cada prenda es el promedio
 * de sus ingresos con costo (ponderado por unidades); las que nunca entraron con costo se cuentan aparte.
 */
export async function getStockValuation(db: Db) {
  const cost = db.$with("cost").as(
    db
      .select({
        variantId: stockMovements.variantId,
        unitCost: sql<number>`sum(${stockMovements.quantity}::bigint * ${stockMovements.unitCostCents})::float8 / sum(${stockMovements.quantity})`.as("unit_cost"),
      })
      .from(stockMovements)
      .where(and(gt(stockMovements.quantity, 0), isNotNull(stockMovements.unitCostCents)))
      .groupBy(stockMovements.variantId),
  );
  const rows = await db
    .with(cost)
    .select({
      warehouseId: warehouses.id,
      name: warehouses.name,
      units: sumInt(inventoryLevels.quantity),
      priceCents: sql<number>`coalesce(sum(${inventoryLevels.quantity}::bigint * ${productVariants.priceCents}), 0)::float8`,
      costCents: sql<number>`coalesce(sum(${inventoryLevels.quantity} * ${cost.unitCost}), 0)::float8`,
      unitsWithoutCost: sql<number>`coalesce(sum(${inventoryLevels.quantity}) filter (where ${cost.unitCost} is null), 0)::int`,
    })
    .from(warehouses)
    .leftJoin(inventoryLevels, and(eq(inventoryLevels.warehouseId, warehouses.id), gt(inventoryLevels.quantity, 0)))
    .leftJoin(productVariants, eq(productVariants.id, inventoryLevels.variantId))
    .leftJoin(cost, eq(cost.variantId, inventoryLevels.variantId))
    .where(eq(warehouses.isActive, true))
    .groupBy(warehouses.id, warehouses.name)
    .orderBy(asc(warehouses.name));
  return rows.map((r) => ({ ...r, priceCents: Math.round(r.priceCents), costCents: Math.round(r.costCents) }));
}

// ─── Registro de ventas ──────────────────────────────────────────────────────

export type LedgerRow = {
  at: Date;
  channel: "Tienda" | "Web";
  document: string;
  number: string;
  /** El comprobante que modifica una nota de crédito o una devolución. */
  reference: string | null;
  customerDocumentType: "dni" | "ce" | "pasaporte" | "ruc" | null;
  customerDocumentNumber: string | null;
  customerName: string | null;
  payment: string | null;
  /** Valor de venta e IGV: solo de boletas, facturas y notas de crédito (los comprobantes electrónicos). */
  baseCents: number | null;
  igvCents: number | null;
  totalCents: number;
  status: string;
  sunat: string | null;
};

/**
 * Cada venta, anulación, nota de crédito y devolución de las fechas, de la más antigua a la más nueva. Las anuladas
 * van en cero (como en el registro de ventas de SUNAT) y las devoluciones en negativo.
 */
export async function getSalesLedger(db: Db, range: ReportRange) {
  const [sales, saleItems, returns, returnItems, webOrders, webRefunds] = await Promise.all([
    db
      .select({
        id: posSales.id,
        at: posSales.createdAt,
        documentType: posSales.documentType,
        series: posSales.series,
        number: posSales.number,
        status: posSales.status,
        sunatStatus: posSales.sunatStatus,
        customerDocumentType: posSales.customerDocumentType,
        customerDocumentNumber: posSales.customerDocumentNumber,
        customerName: posSales.customerName,
        manualDiscountCents: posSales.manualDiscountCents,
        shippingCents: posSales.shippingCents,
        totalCents: posSales.totalCents,
        methods: sql<string | null>`(select string_agg(distinct p.method::text, ',') from ${posPayments} p where p.sale_id = ${posSales.id})`,
      })
      .from(posSales)
      .where(inRange(posSales.createdAt, range)),
    // En el orden de la boleta: el descuento se reparte igual que en lo que se mandó a SUNAT.
    db
      .select({ saleId: posSaleItems.saleId, totalCents: posSaleItems.totalCents })
      .from(posSaleItems)
      .innerJoin(posSales, eq(posSales.id, posSaleItems.saleId))
      .where(inRange(posSales.createdAt, range))
      .orderBy(asc(posSaleItems.saleId), asc(posSaleItems.productName), asc(posSaleItems.sku)),
    db
      .select({
        id: posReturns.id,
        at: posReturns.createdAt,
        number: posReturns.number,
        refundMethod: posReturns.refundMethod,
        refundCents: posReturns.refundCents,
        creditNoteSeries: posReturns.creditNoteSeries,
        creditNoteNumber: posReturns.creditNoteNumber,
        sunatStatus: posReturns.sunatStatus,
        saleType: posSales.documentType,
        saleSeries: posSales.series,
        saleNumber: posSales.number,
        customerDocumentType: posSales.customerDocumentType,
        customerDocumentNumber: posSales.customerDocumentNumber,
        customerName: posSales.customerName,
      })
      .from(posReturns)
      .innerJoin(posSales, eq(posSales.id, posReturns.saleId))
      .where(inRange(posReturns.createdAt, range)),
    db
      .select({ returnId: posReturnItems.returnId, amountCents: posReturnItems.amountCents })
      .from(posReturnItems)
      .innerJoin(posReturns, eq(posReturns.id, posReturnItems.returnId))
      .where(inRange(posReturns.createdAt, range)),
    db
      .select({
        at: orders.createdAt,
        number: orders.number,
        invoiceType: orders.invoiceType,
        documentType: orders.documentType,
        documentNumber: orders.documentNumber,
        customerName: orders.customerName,
        ruc: orders.ruc,
        businessName: orders.businessName,
        paymentMethod: orders.paymentMethod,
        totalCents: orders.totalCents,
      })
      .from(orders)
      .where(and(inArray(orders.status, PAID_STATUSES), inRange(orders.createdAt, range))),
    db
      .select({ at: refunds.createdAt, amountCents: refunds.amountCents, orderNumber: orders.number, customerName: orders.customerName, documentType: orders.documentType, documentNumber: orders.documentNumber })
      .from(refunds)
      .innerJoin(orders, eq(orders.id, refunds.orderId))
      .where(and(inArray(orders.status, PAID_STATUSES), inRange(refunds.createdAt, range))),
  ]);

  const linesOf = new Map<string, number[]>();
  for (const i of saleItems) linesOf.set(i.saleId, [...(linesOf.get(i.saleId) ?? []), i.totalCents]);
  const returnLinesOf = new Map<string, number[]>();
  for (const i of returnItems) returnLinesOf.set(i.returnId, [...(returnLinesOf.get(i.returnId) ?? []), i.amountCents]);

  const rows: LedgerRow[] = [];
  for (const s of sales) {
    const electronic = s.documentType === "boleta" || s.documentType === "factura";
    const voided = s.status === "anulada";
    const lines = [...netLineTotals(linesOf.get(s.id) ?? [], s.manualDiscountCents), ...(s.shippingCents > 0 ? [s.shippingCents] : [])];
    const split = electronic && !voided ? igvSplit(lines) : null;
    rows.push({
      at: s.at,
      channel: "Tienda",
      document: s.documentType,
      number: `${s.series}-${s.number}`,
      reference: null,
      customerDocumentType: s.customerDocumentType,
      customerDocumentNumber: s.customerDocumentNumber,
      customerName: s.customerName,
      payment: s.methods,
      baseCents: split?.baseCents ?? (electronic ? 0 : null),
      igvCents: split?.igvCents ?? (electronic ? 0 : null),
      totalCents: voided ? 0 : s.totalCents,
      status: voided ? "anulada" : "pagada",
      sunat: s.sunatStatus,
    });
  }
  for (const r of returns) {
    const split = r.creditNoteSeries ? igvSplit(returnLinesOf.get(r.id) ?? []) : null;
    rows.push({
      at: r.at,
      channel: "Tienda",
      document: r.creditNoteSeries ? "nota_credito" : "devolucion",
      number: r.creditNoteSeries ? `${r.creditNoteSeries}-${r.creditNoteNumber}` : `DEV-${r.number}`,
      reference: `${r.saleSeries}-${r.saleNumber}`,
      customerDocumentType: r.customerDocumentType,
      customerDocumentNumber: r.customerDocumentNumber,
      customerName: r.customerName,
      payment: r.refundMethod,
      baseCents: split ? -split.baseCents : null,
      igvCents: split ? -split.igvCents : null,
      totalCents: -r.refundCents,
      status: "devuelta",
      sunat: r.sunatStatus,
    });
  }
  for (const o of webOrders) {
    const factura = o.invoiceType === "factura" && o.ruc;
    rows.push({
      at: o.at,
      channel: "Web",
      document: "pedido_web",
      number: `#${o.number}`,
      reference: null,
      customerDocumentType: factura ? "ruc" : o.documentType,
      customerDocumentNumber: factura ? o.ruc : o.documentNumber,
      customerName: factura ? (o.businessName ?? o.customerName) : o.customerName,
      payment: o.paymentMethod,
      baseCents: null,
      igvCents: null,
      totalCents: o.totalCents,
      status: "pagada",
      sunat: null,
    });
  }
  for (const r of webRefunds) {
    rows.push({
      at: r.at,
      channel: "Web",
      document: "devolucion_web",
      number: `#${r.orderNumber}`,
      reference: `#${r.orderNumber}`,
      customerDocumentType: r.documentType,
      customerDocumentNumber: r.documentNumber,
      customerName: r.customerName,
      payment: null,
      baseCents: null,
      igvCents: null,
      totalCents: -r.amountCents,
      status: "devuelta",
      sunat: null,
    });
  }
  return rows.sort((a, b) => a.at.getTime() - b.at.getTime());
}
