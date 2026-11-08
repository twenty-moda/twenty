/**
 * Comprobantes de la tienda por tipo (pedido de TWENTY, 08/11/2026: «pestañas de boletas, notas y facturas, a veces no
 * cuadra y tenemos que verificar cada comprobante del día»). Cada venta del rango con su número, cliente, estado en
 * SUNAT y pago; y las devoluciones con su nota de crédito. Lo usan /admin/ventas-tienda y su Excel.
 */
import { and, asc, eq, gte, ilike, lt, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { PosDocumentType } from "@/lib/pos";
import type { ReportRange } from "@/lib/reports";
import type { Db } from "../db/client";
import { cashSessions, posPayments, posReturns, posSaleItems, posSales, users, warehouses } from "../db/schema";

export const RECEIPT_TABS = ["todos", "nota_venta", "boleta", "factura", "devoluciones"] as const;
export type ReceiptTab = (typeof RECEIPT_TABS)[number];
export type ReceiptFilter = { range: Pick<ReportRange, "from" | "to">; sellerId?: string; q?: string };

const seller = alias(users, "receipt_seller");
const SALES_ID = sql.raw(`"pos_sales"."id"`);
export const RECEIPTS_PAGE_SIZE = 100;

function saleConditions({ range, sellerId, q }: ReceiptFilter, documentType?: PosDocumentType): SQL[] {
  const conditions: SQL[] = [gte(posSales.createdAt, range.from), lt(posSales.createdAt, range.to)];
  if (documentType) conditions.push(eq(posSales.documentType, documentType));
  if (sellerId) conditions.push(eq(posSales.sellerId, sellerId));
  if (q?.trim()) {
    const term = q.trim();
    const like = `%${term}%`;
    const [series, num] = term.toUpperCase().split("-");
    conditions.push(
      or(
        ilike(posSales.customerName, like),
        ilike(posSales.customerDocumentNumber, like),
        num && /^\d+$/.test(num) ? and(eq(posSales.series, series), eq(posSales.number, Number(num))) : undefined,
      )!,
    );
  }
  return conditions;
}

/** Ventas del rango (de una pestaña o todas), de la más antigua a la más nueva: así se cuadran contra Insaga o SUNAT. */
export async function listReceiptSales(db: Db, filter: ReceiptFilter & { documentType?: PosDocumentType; page?: number; pageSize?: number }) {
  const where = and(...saleConditions(filter, filter.documentType));
  const pageSize = filter.pageSize ?? RECEIPTS_PAGE_SIZE;
  const page = filter.page ?? 1;
  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: posSales.id,
        createdAt: posSales.createdAt,
        documentType: posSales.documentType,
        series: posSales.series,
        number: posSales.number,
        customerDocumentType: posSales.customerDocumentType,
        customerDocumentNumber: posSales.customerDocumentNumber,
        customerName: posSales.customerName,
        status: posSales.status,
        sunatStatus: posSales.sunatStatus,
        sunatVoidStatus: posSales.sunatVoidStatus,
        sunatPdfUrl: posSales.sunatPdfUrl,
        totalCents: posSales.totalCents,
        sellerName: seller.name,
        warehouseCode: warehouses.code,
        sessionNumber: cashSessions.number,
        methods: sql<string | null>`(select string_agg(distinct p.method::text, ',') from ${posPayments} p where p.sale_id = ${SALES_ID})`,
        units: sql<number>`(select coalesce(sum(i.quantity), 0)::int from ${posSaleItems} i where i.sale_id = ${SALES_ID})`,
      })
      .from(posSales)
      .innerJoin(warehouses, eq(warehouses.id, posSales.warehouseId))
      .innerJoin(cashSessions, eq(cashSessions.id, posSales.cashSessionId))
      .leftJoin(seller, eq(seller.id, posSales.sellerId))
      .where(where)
      .orderBy(asc(posSales.createdAt), asc(posSales.number))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ total: sql<number>`count(*)::int` }).from(posSales).where(where),
  ]);
  return { rows, total, page, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
}
export type ReceiptSale = Awaited<ReturnType<typeof listReceiptSales>>["rows"][number];

/** Devoluciones del rango con su nota de crédito (o DEV-n si la venta fue nota de venta). */
export async function listReceiptReturns(db: Db, { range, sellerId, q }: ReceiptFilter) {
  const conditions: SQL[] = [gte(posReturns.createdAt, range.from), lt(posReturns.createdAt, range.to)];
  // Por vendedor: las devoluciones de sus ventas.
  if (sellerId) conditions.push(eq(posSales.sellerId, sellerId));
  if (q?.trim()) {
    const like = `%${q.trim()}%`;
    conditions.push(or(ilike(posSales.customerName, like), ilike(posSales.customerDocumentNumber, like), ilike(sql`${posReturns.creditNoteSeries} || '-' || ${posReturns.creditNoteNumber}`, like))!);
  }
  return db
    .select({
      id: posReturns.id,
      saleId: posReturns.saleId,
      createdAt: posReturns.createdAt,
      number: posReturns.number,
      creditNoteSeries: posReturns.creditNoteSeries,
      creditNoteNumber: posReturns.creditNoteNumber,
      sunatStatus: posReturns.sunatStatus,
      refundCents: posReturns.refundCents,
      refundMethod: posReturns.refundMethod,
      reason: posReturns.reason,
      saleDocumentType: posSales.documentType,
      saleSeries: posSales.series,
      saleNumber: posSales.number,
      customerDocumentType: posSales.customerDocumentType,
      customerDocumentNumber: posSales.customerDocumentNumber,
      customerName: posSales.customerName,
      sessionNumber: cashSessions.number,
    })
    .from(posReturns)
    .innerJoin(posSales, eq(posSales.id, posReturns.saleId))
    .innerJoin(cashSessions, eq(cashSessions.id, posReturns.cashSessionId))
    .where(and(...conditions))
    .orderBy(asc(posReturns.createdAt))
    .limit(2000);
}
export type ReceiptReturn = Awaited<ReturnType<typeof listReceiptReturns>>[number];

/** Cuántos comprobantes hay de cada tipo en el rango (para las pestañas y para cuadrar): pagados, anulados y en SUNAT. */
export async function receiptCounts(db: Db, filter: ReceiptFilter) {
  const [byType, [returns]] = await Promise.all([
    db
      .select({
        documentType: posSales.documentType,
        count: sql<number>`count(*) filter (where ${posSales.status} = 'pagada')::int`,
        cents: sql<number>`coalesce(sum(${posSales.totalCents}) filter (where ${posSales.status} = 'pagada'), 0)::int`,
        voided: sql<number>`count(*) filter (where ${posSales.status} = 'anulada')::int`,
        pending: sql<number>`count(*) filter (where ${posSales.status} = 'pagada' and ${posSales.sunatStatus} = 'pendiente')::int`,
        rejected: sql<number>`count(*) filter (where ${posSales.status} = 'pagada' and ${posSales.sunatStatus} = 'rechazado')::int`,
        first: sql<number | null>`min(${posSales.number})::int`,
        last: sql<number | null>`max(${posSales.number})::int`,
      })
      .from(posSales)
      .where(and(...saleConditions(filter)))
      .groupBy(posSales.documentType),
    db
      .select({
        count: sql<number>`count(*)::int`,
        cents: sql<number>`coalesce(sum(${posReturns.refundCents}), 0)::int`,
        creditNotes: sql<number>`count(${posReturns.creditNoteSeries})::int`,
        pending: sql<number>`count(*) filter (where ${posReturns.sunatStatus} in ('pendiente', 'rechazado'))::int`,
      })
      .from(posReturns)
      .innerJoin(posSales, eq(posSales.id, posReturns.saleId))
      .where(and(gte(posReturns.createdAt, filter.range.from), lt(posReturns.createdAt, filter.range.to), filter.sellerId ? eq(posSales.sellerId, filter.sellerId) : undefined)),
  ]);
  const of = (type: PosDocumentType) => byType.find((t) => t.documentType === type) ?? { documentType: type, count: 0, cents: 0, voided: 0, pending: 0, rejected: 0, first: null, last: null };
  return {
    nota_venta: of("nota_venta"),
    boleta: of("boleta"),
    factura: of("factura"),
    returns,
    all: {
      count: byType.reduce((s, t) => s + t.count, 0),
      cents: byType.reduce((s, t) => s + t.cents, 0),
      voided: byType.reduce((s, t) => s + t.voided, 0),
    },
  };
}

/** Quienes vendieron alguna vez (para el filtro por vendedor). */
export async function listSellers(db: Db) {
  return db
    .selectDistinct({ id: users.id, name: users.name, role: users.role })
    .from(posSales)
    .innerJoin(users, eq(users.id, posSales.sellerId))
    .orderBy(asc(users.name));
}

