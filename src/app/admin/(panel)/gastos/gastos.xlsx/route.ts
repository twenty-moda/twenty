import writeExcelFile from "write-excel-file/node";
import { expenseCategoryLabel, expenseDocumentLabel, expenseMonth } from "@/lib/expenses";
import { PAYMENT_LABEL } from "@/lib/pos";
import { getDb } from "@/server/db/client";
import { listExpenses } from "@/server/services/expenses";
import { getStaff } from "../../../_lib/auth";

const header = (value: string) => ({ value, fontWeight: "bold" as const, backgroundColor: "#EEEEEE" });
/** "2026-11-08" → "08/11/2026", como lo lee el Excel en español. */
const day = (iso: string) => iso.split("-").reverse().join("/");

/** Los gastos del mes en Excel (como «Exportar Excel» del listado de gastos de Insaga). El vendedor exporta los suyos. */
export async function GET(request: Request) {
  const user = await getStaff();
  if (!user) return new Response("No autorizado", { status: 401 });
  const params = new URL(request.url).searchParams;
  const { month, from, to } = expenseMonth(params.get("mes"));
  const { rows, totalCents } = await listExpenses(getDb(), {
    from,
    to,
    q: params.get("q") ?? undefined,
    category: params.get("motivo") ?? undefined,
    userId: user.role === "admin" ? undefined : user.id,
  });
  const data = [
    ["#", "Fecha", "Proveedor", "Doc. proveedor", "Detalle", "Comprobante", "N° comprobante", "Motivo", "Medio de pago", "Caja", "Tienda", "Registró", "Estado", "Moneda", "Total"].map(header),
    ...rows.map((r) => [
      { value: r.number },
      { value: day(r.issuedOn) },
      { value: r.supplierName ?? "" },
      { value: r.supplierDocument ?? "" },
      { value: r.description },
      { value: expenseDocumentLabel(r.documentType) },
      { value: r.documentNumber ?? "" },
      { value: expenseCategoryLabel(r.category) },
      { value: PAYMENT_LABEL[r.paymentMethod] },
      { value: r.cashSessionNumber ? `#${r.cashSessionNumber}` : "" },
      { value: r.warehouseCode },
      { value: r.userName ?? "" },
      { value: r.voidedAt ? `Anulado: ${r.voidReason ?? ""}` : "Vigente" },
      { value: "PEN" },
      { value: r.voidedAt ? 0 : r.amountCents / 100, format: "#,##0.00" },
    ]),
    [...Array.from({ length: 13 }, () => null), header("Total"), { value: totalCents / 100, format: "#,##0.00", fontWeight: "bold" as const }],
  ];
  const buffer = await writeExcelFile(data, {
    columns: [{ width: 6 }, { width: 12 }, { width: 28 }, { width: 14 }, { width: 30 }, { width: 18 }, { width: 14 }, { width: 22 }, { width: 14 }, { width: 8 }, { width: 8 }, { width: 18 }, { width: 22 }, { width: 8 }, { width: 12 }],
    sheet: "Gastos",
  }).toBuffer();
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="gastos-twenty-${month}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
