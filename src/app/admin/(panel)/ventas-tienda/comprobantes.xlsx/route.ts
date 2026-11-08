import writeExcelFile from "write-excel-file/node";
import { DOCUMENT_LABEL } from "@/lib/order-status";
import { CHANNEL_LABEL, formatDocNumber, PAYMENT_LABEL, POS_DOCUMENT_LABEL, SALE_CHANNELS, type PaymentMethod, type SaleChannel } from "@/lib/pos";
import { dayRange } from "@/lib/reports";
import { getDb } from "@/server/db/client";
import { listReceiptReturns, listReceiptSales, RECEIPT_TABS, type ReceiptTab } from "@/server/services/receipts";
import { getStaff } from "../../../_lib/auth";

const header = (value: string) => ({ value, fontWeight: "bold" as const, backgroundColor: "#EEEEEE" });
const when = new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const SUNAT: Record<string, string> = { aceptado: "Aceptado", pendiente: "Pendiente", rechazado: "Rechazado" };
const methods = (value: string | null) =>
  (value ?? "")
    .split(",")
    .filter(Boolean)
    .map((m) => PAYMENT_LABEL[m as PaymentMethod] ?? m)
    .join(" + ");

/** Los comprobantes de la pestaña y las fechas en Excel, para cuadrarlos uno por uno. */
export async function GET(request: Request) {
  const user = await getStaff();
  if (!user) return new Response("No autorizado", { status: 401 });
  const params = new URL(request.url).searchParams;
  const tab: ReceiptTab = RECEIPT_TABS.includes(params.get("tipo") as ReceiptTab) ? (params.get("tipo") as ReceiptTab) : "todos";
  const range = dayRange(params.get("desde"), params.get("hasta"));
  const vendedor = params.get("vendedor");
  const canal = params.get("canal") as SaleChannel | null;
  const filter = {
    range,
    sellerId: vendedor && /^[0-9a-f-]{36}$/i.test(vendedor) ? vendedor : undefined,
    q: params.get("q") ?? undefined,
    channel: canal && SALE_CHANNELS.includes(canal) ? canal : undefined,
  };
  const db = getDb();

  let data;
  if (tab === "devoluciones") {
    const rows = await listReceiptReturns(db, filter);
    data = [
      ["Fecha", "Documento", "Modifica a", "Tipo doc.", "N° doc.", "Cliente", "SUNAT", "Motivo", "Devuelto por", "Caja", "Moneda", "Total"].map(header),
      ...rows.map((r) => [
        { value: when.format(r.createdAt).replace(",", "") },
        { value: r.creditNoteSeries ? formatDocNumber(r.creditNoteSeries, r.creditNoteNumber!) : `DEV-${r.number}` },
        { value: formatDocNumber(r.saleSeries, r.saleNumber) },
        { value: r.customerDocumentType ? DOCUMENT_LABEL[r.customerDocumentType] : "" },
        { value: r.customerDocumentNumber ?? "" },
        { value: r.customerName ?? "CLIENTES VARIOS" },
        { value: r.sunatStatus ? SUNAT[r.sunatStatus] : "" },
        { value: r.reason },
        { value: PAYMENT_LABEL[r.refundMethod] },
        { value: `#${r.sessionNumber}` },
        { value: "PEN" },
        { value: -r.refundCents / 100, format: "#,##0.00" },
      ]),
    ];
  } else {
    const { rows } = await listReceiptSales(db, { ...filter, documentType: tab === "todos" ? undefined : tab, pageSize: 10_000 });
    data = [
      ["#", "Emisión", "Comprobante", "Número", "Canal", "Tipo doc.", "N° doc.", "Cliente", "SUNAT", "Estado", "Medio de pago", "Vendedor", "Caja", "Moneda", "Total"].map(header),
      ...rows.map((s, i) => [
        { value: i + 1 },
        { value: when.format(s.createdAt).replace(",", "") },
        { value: POS_DOCUMENT_LABEL[s.documentType] },
        { value: formatDocNumber(s.series, s.number) },
        { value: CHANNEL_LABEL[s.channel] },
        { value: s.customerDocumentType ? DOCUMENT_LABEL[s.customerDocumentType] : "" },
        { value: s.customerDocumentNumber ?? "" },
        { value: s.customerName ?? "CLIENTES VARIOS" },
        { value: s.sunatStatus ? SUNAT[s.sunatStatus] : "No va a SUNAT" },
        { value: s.status === "anulada" ? "Anulada" : "Pagada" },
        { value: methods(s.methods) },
        { value: s.sellerName ?? "" },
        { value: `#${s.sessionNumber}` },
        { value: "PEN" },
        { value: s.status === "anulada" ? 0 : s.totalCents / 100, format: "#,##0.00" },
      ]),
    ];
  }
  const buffer = await writeExcelFile(data, { sheet: "Comprobantes", columns: data[0].map(() => ({ width: 16 })) }).toBuffer();
  const name = range.desde === range.hasta ? range.desde : `${range.desde}_${range.hasta}`;
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="comprobantes-${tab}-${name}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
