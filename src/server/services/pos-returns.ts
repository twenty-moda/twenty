/**
 * Devoluciones de ventas de la tienda: las prendas vuelven al stock y el dinero sale de la caja abierta (aunque la
 * de la venta ya se haya cerrado). Si la venta fue boleta o factura, la devolución lleva su nota de crédito.
 */
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import { PAYMENT_METHODS, returnAmount, returnLines } from "@/lib/pos";
import type { Db } from "../db/client";
import { cashSessions, posReturnItems, posReturns, posSaleItems, posSales, products, productVariants, users, warehouses } from "../db/schema";
import { emitDocument, takeNumber, type SunatSendResult } from "./pos";
import { moveStock } from "./stock";
import { creditNotePayload, type SunatClient } from "./sunat";

type Fail = { ok: false; message: string };

export const returnInputSchema = z.object({
  saleId: z.uuid(),
  items: z.array(z.object({ saleItemId: z.uuid(), quantity: z.number().int().positive() })).min(1, "Elige qué prendas se devuelven."),
  reason: z.string().trim().min(3, "Escribe por qué se devuelve.").max(250),
  refundMethod: z.enum(PAYMENT_METHODS),
});
export type ReturnInput = z.infer<typeof returnInputSchema>;

export type RegisterReturnResult = { ok: true; returnId: string; refundCents: number; creditNote: { series: string; number: number } | null; productSlugs: string[] } | Fail;

export async function registerReturn(db: Db, input: ReturnInput, userId: string | null): Promise<RegisterReturnResult> {
  const quantities = new Map<string, number>();
  for (const i of input.items) quantities.set(i.saleItemId, (quantities.get(i.saleItemId) ?? 0) + i.quantity);

  return db.transaction(async (tx) => {
    // FOR UPDATE: dos devoluciones de la misma venta a la vez no pueden devolver las mismas prendas.
    const [sale] = await tx.select().from(posSales).where(eq(posSales.id, input.saleId)).for("update");
    if (!sale) return { ok: false as const, message: "La venta no existe." };
    if (sale.status === "anulada") return { ok: false as const, message: "La venta está anulada: sus prendas ya volvieron al stock." };
    const electronic = sale.documentType === "boleta" || sale.documentType === "factura";
    if (electronic && sale.sunatStatus === "pendiente") return { ok: false as const, message: "El comprobante todavía no tiene respuesta de SUNAT: reintenta el envío antes de devolver." };
    if (electronic && sale.sunatStatus === "rechazado") return { ok: false as const, message: "SUNAT rechazó el comprobante de esta venta: no lleva nota de crédito. Anula la venta." };

    const [session] = await tx
      .select({ id: cashSessions.id })
      .from(cashSessions)
      .where(and(eq(cashSessions.warehouseId, sale.warehouseId), isNull(cashSessions.closedAt)))
      .for("share");
    if (!session) return { ok: false as const, message: "La caja de la tienda está cerrada: ábrela para devolver el dinero." };

    const items = await tx.select().from(posSaleItems).where(eq(posSaleItems.saleId, sale.id)).orderBy(asc(posSaleItems.productName), asc(posSaleItems.sku));
    const returned = await tx
      .select({ saleItemId: posReturnItems.saleItemId, quantity: posReturnItems.quantity, amountCents: posReturnItems.amountCents })
      .from(posReturnItems)
      .innerJoin(posReturns, eq(posReturns.id, posReturnItems.returnId))
      .where(eq(posReturns.saleId, sale.id));
    const lines = returnLines(items, sale.manualDiscountCents, returned);

    const rows: { item: (typeof items)[number]; quantity: number; amountCents: number }[] = [];
    for (const [saleItemId, quantity] of quantities) {
      const index = items.findIndex((i) => i.id === saleItemId);
      if (index < 0) return { ok: false as const, message: "Una de las prendas no es de esta venta." };
      const line = lines[index];
      if (line.returnedQty + quantity > line.soldQty) {
        const left = line.soldQty - line.returnedQty;
        return { ok: false as const, message: `De ${items[index].sku} ${left === 0 ? "ya se devolvió todo" : left === 1 ? "solo queda 1 por devolver" : `solo quedan ${left} por devolver`}.` };
      }
      rows.push({ item: items[index], quantity, amountCents: returnAmount(line, quantity) });
    }
    const refundCents = rows.reduce((s, r) => s + r.amountCents, 0);
    // Catálogo 09: 06 si en una sola vez vuelve toda la venta (sin envío de por medio), 07 si es por prendas.
    const whole = returned.length === 0 && sale.shippingCents === 0 && lines.every((l, i) => quantities.get(items[i].id) === l.soldQty);

    const creditNote = electronic ? await takeNumber(tx, sale.warehouseId, sale.documentType === "boleta" ? "nota_credito_boleta" : "nota_credito_factura") : null;
    const [ret] = await tx
      .insert(posReturns)
      .values({
        saleId: sale.id,
        warehouseId: sale.warehouseId,
        cashSessionId: session.id,
        userId,
        reasonCode: whole ? "06" : "07",
        reason: input.reason,
        refundMethod: input.refundMethod,
        refundCents,
        creditNoteSeries: creditNote?.series ?? null,
        creditNoteNumber: creditNote?.number ?? null,
        sunatStatus: creditNote ? "pendiente" : null,
      })
      .returning({ id: posReturns.id });
    await tx.insert(posReturnItems).values(rows.map((r) => ({ returnId: ret.id, saleItemId: r.item.id, quantity: r.quantity, amountCents: r.amountCents })));

    // Una prenda que ya no existe en el catálogo se devuelve en dinero pero no puede volver al stock.
    const back = rows.filter((r) => r.item.variantId).map((r) => ({ variantId: r.item.variantId!, warehouseId: sale.warehouseId, quantity: r.quantity }));
    if (back.length) await moveStock(tx, back, { type: "devolucion_cliente", posSaleId: sale.id, userId, note: input.reason });

    const [warehouse] = await tx.select({ sellsOnline: warehouses.sellsOnline }).from(warehouses).where(eq(warehouses.id, sale.warehouseId));
    const slugs =
      warehouse?.sellsOnline && back.length
        ? await tx
            .selectDistinct({ slug: products.slug })
            .from(productVariants)
            .innerJoin(products, eq(products.id, productVariants.productId))
            .where(inArray(productVariants.id, back.map((b) => b.variantId)))
        : [];
    return { ok: true as const, returnId: ret.id, refundCents, creditNote, productSlugs: slugs.map((s) => s.slug) };
  });
}

/** Manda a SUNAT la nota de crédito de una devolución (y la reintenta si quedó pendiente), con `Idempotency-Key` = id de la devolución. */
export async function sendReturnToSunat(db: Db, returnId: string, client: SunatClient | null): Promise<SunatSendResult> {
  const [row] = await db
    .select({ ret: posReturns, sale: posSales })
    .from(posReturns)
    .innerJoin(posSales, eq(posSales.id, posReturns.saleId))
    .where(eq(posReturns.id, returnId))
    .limit(1);
  const { ret, sale } = row ?? {};
  const documentType = sale?.documentType;
  if (!ret?.sunatStatus || !ret.creditNoteSeries || !ret.creditNoteNumber || (documentType !== "boleta" && documentType !== "factura")) throw new Error("Esa devolución no lleva nota de crédito");
  if (ret.sunatStatus === "aceptado") return { status: ret.sunatStatus, message: ret.sunatMessage };
  const items = await db
    .select({ sku: posSaleItems.sku, productName: posSaleItems.productName, colorName: posSaleItems.colorName, sizeLabel: posSaleItems.sizeLabel, quantity: posReturnItems.quantity, amountCents: posReturnItems.amountCents })
    .from(posReturnItems)
    .innerJoin(posSaleItems, eq(posSaleItems.id, posReturnItems.saleItemId))
    .where(eq(posReturnItems.returnId, ret.id))
    .orderBy(asc(posSaleItems.productName), asc(posSaleItems.sku));
  const payload = creditNotePayload({
    series: ret.creditNoteSeries,
    number: ret.creditNoteNumber,
    createdAt: ret.createdAt,
    reasonCode: ret.reasonCode,
    reason: ret.reason,
    refundCents: ret.refundCents,
    sale: { ...sale!, documentType },
    items,
  });
  const sent = await emitDocument(client, payload, ret.id, `${ret.creditNoteSeries}-${ret.creditNoteNumber}`);
  await db.update(posReturns).set(sent.fields).where(eq(posReturns.id, ret.id));
  return { status: sent.status, message: sent.message };
}

/** Reintenta las notas de crédito pendientes, de la más antigua a la más nueva (lo corre el cron junto con las ventas). */
export async function retryPendingReturns(db: Db, client: SunatClient | null, { limit = 20 }: { limit?: number } = {}) {
  if (!client) return { checked: 0, accepted: 0 };
  const pending = await db.select({ id: posReturns.id }).from(posReturns).where(eq(posReturns.sunatStatus, "pendiente")).orderBy(asc(posReturns.createdAt)).limit(limit);
  let accepted = 0;
  for (const { id } of pending) if ((await sendReturnToSunat(db, id, client)).status === "aceptado") accepted++;
  return { checked: pending.length, accepted };
}

const returnedBy = alias(users, "returned_by");

/** Las devoluciones de una venta, con sus prendas (en el orden de la boleta). */
export async function listSaleReturns(db: Db, saleId: string) {
  const returns = await db
    .select({ ret: posReturns, userName: returnedBy.name, sessionNumber: cashSessions.number })
    .from(posReturns)
    .innerJoin(cashSessions, eq(cashSessions.id, posReturns.cashSessionId))
    .leftJoin(returnedBy, eq(returnedBy.id, posReturns.userId))
    .where(eq(posReturns.saleId, saleId))
    .orderBy(asc(posReturns.createdAt));
  if (!returns.length) return [];
  const items = await db
    .select({ returnId: posReturnItems.returnId, saleItemId: posReturnItems.saleItemId, quantity: posReturnItems.quantity, amountCents: posReturnItems.amountCents, sku: posSaleItems.sku, productName: posSaleItems.productName, colorName: posSaleItems.colorName, sizeLabel: posSaleItems.sizeLabel })
    .from(posReturnItems)
    .innerJoin(posSaleItems, eq(posSaleItems.id, posReturnItems.saleItemId))
    .where(inArray(posReturnItems.returnId, returns.map((r) => r.ret.id)))
    .orderBy(asc(posSaleItems.productName), asc(posSaleItems.sku));
  return returns.map((r) => ({ ...r.ret, userName: r.userName, sessionNumber: r.sessionNumber, items: items.filter((i) => i.returnId === r.ret.id) }));
}
export type SaleReturn = Awaited<ReturnType<typeof listSaleReturns>>[number];
