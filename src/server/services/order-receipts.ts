/**
 * Comprobante de los pedidos de la web (pedido de TWENTY, 26/11/2026): «que le llegue al cliente después de poner el
 * pedido como entregado». Al pasar a «Entregado» (desde el panel o por el aviso del courier) se emite el que eligió el
 * cliente en el checkout (boleta o factura), o la nota de venta si el equipo la cambió en el panel, y le llega por
 * correo (`receipt-emails.ts`). Series propias de la web: B006, F006 y NV06.
 *
 * Boleta y factura van a SUNAT como las de la tienda (`emitDocument`, `Idempotency-Key` = id del comprobante): si
 * queda pendiente se reintenta con la venta siguiente del POS y con el cron diario. Un pedido entregado ya no se
 * anula, así que el comprobante no necesita baja.
 */
import { asc, eq, sql } from "drizzle-orm";
import { checkCustomer, SALE_DOCUMENT_TYPES, type PosDocumentType } from "@/lib/pos";
import { orderReceiptAmounts, orderReceiptType } from "@/lib/order-receipts";
import type { Db } from "../db/client";
import { orderDocumentSeries, orderReceipts, orders } from "../db/schema";
import { getOrderById, type StatusChange } from "./orders";
import { emitDocument, freeSeries } from "./pos";
import { salePayload, type SunatClient } from "./sunat";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Fail = { ok: false; message: string };

/** Las series de la web empiezan en 06 (la tienda de Gamarra usa 05; Insaga, 03 y 04). */
const FIRST_WEB_SERIES = 6;

async function takeOrderNumber(tx: Tx, type: PosDocumentType): Promise<{ series: string; number: number }> {
  const [taken] = await tx
    .update(orderDocumentSeries)
    .set({ nextNumber: sql`${orderDocumentSeries.nextNumber} + 1`, updatedAt: new Date() })
    .where(eq(orderDocumentSeries.documentType, type))
    .returning({ series: orderDocumentSeries.series, number: sql<number>`${orderDocumentSeries.nextNumber} - 1` });
  if (taken) return taken;
  const [created] = await tx
    .insert(orderDocumentSeries)
    .values({ documentType: type, series: await freeSeries(tx, type, FIRST_WEB_SERIES), nextNumber: 2 })
    .onConflictDoNothing()
    .returning({ series: orderDocumentSeries.series });
  return created ? { series: created.series, number: 1 } : takeOrderNumber(tx, type);
}

export async function getOrderReceipt(db: Db, orderId: string) {
  const [receipt] = await db.select().from(orderReceipts).where(eq(orderReceipts.orderId, orderId)).limit(1);
  return receipt ?? null;
}
export type OrderReceipt = NonNullable<Awaited<ReturnType<typeof getOrderReceipt>>>;

/** El equipo cambia el comprobante (nota de venta, boleta o factura) mientras no se haya emitido. */
export async function setOrderReceiptType(db: Db, orderId: string, type: PosDocumentType): Promise<{ ok: true } | Fail> {
  if (!(SALE_DOCUMENT_TYPES as readonly string[]).includes(type)) return { ok: false, message: "Elige nota de venta, boleta o factura." };
  const order = await getOrderById(db, orderId);
  if (!order) return { ok: false, message: "El pedido no existe." };
  if (await getOrderReceipt(db, orderId)) return { ok: false, message: "El comprobante ya se emitió." };
  if (type === "factura" && !(order.ruc && order.businessName)) return { ok: false, message: "Para factura el cliente tiene que haber puesto su RUC y razón social en el checkout." };
  await db.update(orders).set({ receiptType: type }).where(eq(orders.id, orderId));
  return { ok: true };
}

/**
 * Emite el comprobante del pedido entregado (si ya lo tiene, devuelve ese). Las prendas y montos se guardan como
 * salieron: lo que se pagó menos lo devuelto hasta ahora.
 */
export async function createOrderReceipt(db: Db, orderId: string): Promise<{ ok: true; receiptId: string; created: boolean } | Fail> {
  const existing = await getOrderReceipt(db, orderId);
  if (existing) return { ok: true, receiptId: existing.id, created: false };
  const order = await getOrderById(db, orderId);
  if (!order) return { ok: false, message: "El pedido no existe." };
  if (order.status !== "entregado") return { ok: false, message: "El comprobante sale cuando el pedido está entregado." };
  const type = orderReceiptType(order);
  const amounts = orderReceiptAmounts(order);
  if (!amounts) return { ok: false, message: "Este pedido no lleva comprobante: se le devolvió todo lo que pagó." };
  const factura = type === "factura";
  if (factura && !(order.ruc && order.businessName)) return { ok: false, message: "Para factura el pedido necesita RUC y razón social." };
  const customer = factura
    ? { documentType: "ruc" as const, documentNumber: order.ruc, name: order.businessName, address: null }
    : { documentType: order.documentType, documentNumber: order.documentNumber, name: order.customerName, address: null };
  const problem = checkCustomer(type, amounts.totalCents, customer);
  if (problem) return { ok: false, message: problem };

  return db.transaction(async (tx) => {
    // El pedido bloqueado: dos entregas a la vez (el panel y el courier) no sacan dos comprobantes.
    await tx.select({ id: orders.id }).from(orders).where(eq(orders.id, orderId)).for("update");
    const [again] = await tx.select({ id: orderReceipts.id }).from(orderReceipts).where(eq(orderReceipts.orderId, orderId));
    if (again) return { ok: true as const, receiptId: again.id, created: false };
    const { series, number } = await takeOrderNumber(tx, type);
    const [row] = await tx
      .insert(orderReceipts)
      .values({
        orderId,
        documentType: type,
        series,
        number,
        customerDocumentType: customer.documentType,
        customerDocumentNumber: customer.documentNumber,
        customerName: customer.name,
        customerAddress: customer.address,
        items: amounts.items,
        discountCents: amounts.discountCents,
        shippingCents: amounts.shippingCents,
        totalCents: amounts.totalCents,
        sunatStatus: type === "nota_venta" ? null : "pendiente",
      })
      .returning({ id: orderReceipts.id });
    return { ok: true as const, receiptId: row.id, created: true };
  });
}

/** Manda (o reintenta) la boleta o factura a SUNAT con las prendas guardadas: un reintento nunca saca otra. */
export async function sendOrderReceiptToSunat(db: Db, receiptId: string, client: SunatClient | null) {
  const [r] = await db.select().from(orderReceipts).where(eq(orderReceipts.id, receiptId)).limit(1);
  if (!r?.sunatStatus || r.sunatStatus === "aceptado" || (r.documentType !== "boleta" && r.documentType !== "factura")) {
    return { status: r?.sunatStatus ?? null, message: r?.sunatMessage ?? null };
  }
  const payload = salePayload({ ...r, documentType: r.documentType, manualDiscountCents: r.discountCents });
  const sent = await emitDocument(client, payload, r.id, `${r.series}-${r.number}`);
  await db.update(orderReceipts).set(sent.fields).where(eq(orderReceipts.id, r.id));
  return { status: sent.status, message: sent.message };
}

/** Al entregar: emite el comprobante y, si es boleta o factura, lo manda a SUNAT. */
export async function issueOrderReceipt(db: Db, orderId: string, client: SunatClient | null) {
  const created = await createOrderReceipt(db, orderId);
  if (!created.ok) return created;
  const sunat = await sendOrderReceiptToSunat(db, created.receiptId, client);
  return { ...created, ...sunat };
}

/**
 * Al pasar a «Entregado» se emite el comprobante. Los errores quedan en el log (el pedido ya cambió de estado); desde
 * el panel se emite o se reintenta.
 */
export async function receiptForStatusChange(db: Db, change: Pick<StatusChange, "orderId" | "to">, client: SunatClient | null): Promise<void> {
  if (change.to !== "entregado") return;
  try {
    const result = await issueOrderReceipt(db, change.orderId, client);
    if (!result.ok) console.warn("[comprobante web] no se emitió:", result.message);
  } catch (error) {
    console.error("[comprobante web]", error instanceof Error ? error.message : error);
  }
}

/** Reintenta las boletas y facturas de la web que quedaron pendientes (las del POS van aparte). */
export async function retryPendingOrderReceipts(db: Db, client: SunatClient | null, { limit = 20 }: { limit?: number } = {}) {
  if (!client) return { checked: 0, accepted: 0 };
  const pending = await db
    .select({ id: orderReceipts.id })
    .from(orderReceipts)
    .where(eq(orderReceipts.sunatStatus, "pendiente"))
    .orderBy(asc(orderReceipts.createdAt))
    .limit(limit);
  let accepted = 0;
  for (const p of pending) if ((await sendOrderReceiptToSunat(db, p.id, client)).status === "aceptado") accepted++;
  return { checked: pending.length, accepted };
}
