import writeExcelFile from "write-excel-file/node";
import { getDb } from "@/server/db/client";
import { listSubscribers } from "@/server/services/messages";
import { getAdmin } from "../../../_lib/auth";

const dayFormat = new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", dateStyle: "short" });

// Emails del boletín para subirlos a la herramienta de mailing que use TWENTY.
export async function GET() {
  if (!(await getAdmin())) return new Response("No autorizado", { status: 401 });
  const rows = await listSubscribers(getDb());
  const header = ["Email", "Fecha"].map((value) => ({ value, fontWeight: "bold" as const, backgroundColor: "#EEEEEE" }));
  const buffer = await writeExcelFile([header, ...rows.map((r) => [{ value: r.email }, { value: dayFormat.format(r.createdAt) }])], {
    columns: [{ width: 36 }, { width: 14 }],
    sheet: "Suscriptores",
  }).toBuffer();
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="suscriptores-twenty.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
