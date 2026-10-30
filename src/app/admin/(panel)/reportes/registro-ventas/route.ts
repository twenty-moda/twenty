import { PAYMENT_METHOD_LABEL } from "@/lib/order-status";
import { PAYMENT_LABEL, type PaymentMethod } from "@/lib/pos";
import { formatLimaDate, reportRange, toCsv } from "@/lib/reports";
import { getDb } from "@/server/db/client";
import { getSalesLedger, type LedgerRow } from "@/server/services/reports";
import { getAdmin } from "../../../_lib/auth";

const DOCUMENT: Record<string, string> = {
  nota_venta: "Nota de venta",
  boleta: "Boleta",
  factura: "Factura",
  nota_credito: "Nota de crédito",
  devolucion: "Devolución (nota de venta)",
  pedido_web: "Pedido web",
  devolucion_web: "Devolución web",
};
const CUSTOMER_DOCUMENT = { dni: "DNI", ce: "CE", pasaporte: "Pasaporte", ruc: "RUC" } as const;
const STATUS: Record<string, string> = { pagada: "Pagada", anulada: "Anulada", devuelta: "Devolución" };
const SUNAT: Record<string, string> = { aceptado: "Aceptado", pendiente: "Pendiente", rechazado: "Rechazado" };
const time = new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const money = (cents: number | null) => (cents === null ? null : (cents / 100).toFixed(2));

function payment(row: LedgerRow) {
  if (!row.payment) return null;
  if (row.channel === "Web") return PAYMENT_METHOD_LABEL[row.payment as keyof typeof PAYMENT_METHOD_LABEL] ?? row.payment;
  return row.payment
    .split(",")
    .map((m) => PAYMENT_LABEL[m as PaymentMethod] ?? m)
    .join(" + ");
}

/**
 * Registro de ventas de las fechas en CSV (Excel), para el contador: cada venta de la tienda y de la web, las anuladas
 * en cero y las devoluciones en negativo. Valor de venta e IGV, como en lo que se mandó a SUNAT.
 */
export async function GET(request: Request) {
  if (!(await getAdmin())) return new Response("No autorizado", { status: 401 });
  const params = new URL(request.url).searchParams;
  const range = reportRange(params.get("desde"), params.get("hasta"));
  const rows = await getSalesLedger(getDb(), range);
  const csv = toCsv([
    ["Fecha", "Hora", "Canal", "Comprobante", "Número", "Modifica a", "Tipo doc. cliente", "N° doc. cliente", "Cliente", "Medio de pago", "Valor de venta", "IGV", "Total", "Estado", "SUNAT"],
    ...rows.map((r) => [
      formatLimaDate(r.at),
      time.format(r.at),
      r.channel,
      DOCUMENT[r.document] ?? r.document,
      r.number,
      r.reference,
      r.customerDocumentType ? CUSTOMER_DOCUMENT[r.customerDocumentType] : null,
      r.customerDocumentNumber,
      r.customerName ?? (r.channel === "Tienda" ? "CLIENTES VARIOS" : null),
      payment(r),
      money(r.baseCents),
      money(r.igvCents),
      money(r.totalCents),
      STATUS[r.status] ?? r.status,
      r.sunat ? SUNAT[r.sunat] : null,
    ]),
  ]);
  // Con BOM, el Excel lee bien las tildes.
  return new Response(`﻿${csv}\r\n`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="registro-de-ventas-${range.desde}-al-${range.hasta}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
