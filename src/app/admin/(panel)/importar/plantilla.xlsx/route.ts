import writeExcelFile from "write-excel-file/node";
import { TEMPLATE_COLUMNS, TEMPLATE_EXAMPLE } from "@/lib/product-import";
import { getAdmin } from "../../../_lib/auth";

// Plantilla vacía con 3 filas de ejemplo.
export async function GET() {
  if (!(await getAdmin())) return new Response("No autorizado", { status: 401 });
  const header = TEMPLATE_COLUMNS.map((value) => ({ value, fontWeight: "bold" as const, backgroundColor: "#EEEEEE" }));
  const buffer = await writeExcelFile([header, ...TEMPLATE_EXAMPLE], {
    columns: [{ width: 28 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 8 }, { width: 12 }, { width: 10 }, { width: 12 }, { width: 8 }, { width: 30 }, { width: 8 }],
    sheet: "Productos",
  }).toBuffer();
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="plantilla-productos-twenty.xlsx"',
    },
  });
}
