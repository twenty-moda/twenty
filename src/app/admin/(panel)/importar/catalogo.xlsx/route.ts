import writeExcelFile from "write-excel-file/node";
import { TEMPLATE_COLUMNS } from "@/lib/product-import";
import { getDb } from "@/server/db/client";
import { exportCatalogRows } from "@/server/services/product-import";
import { getAdmin } from "../../../_lib/auth";

// Todo el catálogo en el formato de la plantilla: se edita en Excel y se vuelve a subir en Carga masiva.
export async function GET() {
  if (!(await getAdmin())) return new Response("No autorizado", { status: 401 });
  const rows = await exportCatalogRows(getDb());
  const header = TEMPLATE_COLUMNS.map((value) => ({ value, fontWeight: "bold" as const, backgroundColor: "#EEEEEE" }));
  const buffer = await writeExcelFile([header, ...rows], {
    columns: [{ width: 28 }, { width: 14 }, { width: 14 }, { width: 16 }, { width: 8 }, { width: 12 }, { width: 10 }, { width: 12 }, { width: 8 }, { width: 30 }, { width: 8 }],
    sheet: "Productos",
  }).toBuffer();
  const date = new Date().toISOString().slice(0, 10);
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="catalogo-twenty-${date}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
