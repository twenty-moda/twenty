/**
 * Reporte de caja (pedido de TWENTY, 08/11/2026: el «Reporte Punto de Venta» de Insaga al cierre del día): el
 * efectivo de la caja, las formas de pago y cada movimiento en orden (ventas, gastos, devoluciones, ingresos y
 * egresos), para imprimirlo en la ticketera y dejarlo con el efectivo.
 */
import { asc, eq } from "drizzle-orm";
import { formatDocNumber, PAYMENT_METHODS, type PaymentMethod } from "@/lib/pos";
import type { Db } from "../db/client";
import { posReturns, posSales } from "../db/schema";
import { getCashSession } from "./pos";

export type CashReportLine = {
  at: Date;
  kind: "venta" | "anulada" | "devolucion" | "gasto" | "ingreso" | "egreso";
  /** NV05-12, B005-3, el detalle del gasto o el motivo del movimiento. */
  document: string;
  /** Con signo: lo que entra suma y lo que sale resta. Una venta anulada va en 0. */
  cents: number;
};

export async function getCashReport(db: Db, number: number) {
  const session = await getCashSession(db, number);
  if (!session) return null;
  const [sales, returns] = await Promise.all([
    db
      .select({ at: posSales.createdAt, documentType: posSales.documentType, series: posSales.series, number: posSales.number, status: posSales.status, totalCents: posSales.totalCents })
      .from(posSales)
      .where(eq(posSales.cashSessionId, session.id))
      .orderBy(asc(posSales.createdAt)),
    db
      .select({ at: posReturns.createdAt, number: posReturns.number, creditNoteSeries: posReturns.creditNoteSeries, creditNoteNumber: posReturns.creditNoteNumber, refundCents: posReturns.refundCents })
      .from(posReturns)
      .where(eq(posReturns.cashSessionId, session.id))
      .orderBy(asc(posReturns.createdAt)),
  ]);

  const lines: CashReportLine[] = [
    ...sales.map((s) => ({ at: s.at, kind: s.status === "anulada" ? ("anulada" as const) : ("venta" as const), document: formatDocNumber(s.series, s.number), cents: s.status === "anulada" ? 0 : s.totalCents })),
    ...returns.map((r) => ({
      at: r.at,
      kind: "devolucion" as const,
      document: r.creditNoteSeries ? formatDocNumber(r.creditNoteSeries, r.creditNoteNumber!) : `DEV-${r.number}`,
      cents: -r.refundCents,
    })),
    ...session.expenses.filter((e) => !e.voidedAt).map((e) => ({ at: e.createdAt, kind: "gasto" as const, document: e.description, cents: -e.amountCents })),
    ...session.movements.map((m) => ({ at: m.createdAt, kind: m.type, document: m.note, cents: m.type === "ingreso" ? m.amountCents : -m.amountCents })),
  ].sort((a, b) => a.at.getTime() - b.at.getTime());

  // Cuántos comprobantes salieron de cada tipo (para cuadrar con SUNAT y con Insaga).
  const documents = (["nota_venta", "boleta", "factura"] as const)
    .map((type) => {
      const ofType = sales.filter((s) => s.documentType === type);
      const paid = ofType.filter((s) => s.status === "pagada");
      return { type, count: paid.length, voided: ofType.length - paid.length, cents: paid.reduce((sum, s) => sum + s.totalCents, 0) };
    })
    .filter((d) => d.count || d.voided);

  const { totals } = session;
  const methods = PAYMENT_METHODS.filter((m) => totals.methods[m] > 0).map((m: PaymentMethod) => ({ method: m, cents: totals.methods[m] }));
  return { session, lines, documents, methods };
}
export type CashReport = NonNullable<Awaited<ReturnType<typeof getCashReport>>>;
