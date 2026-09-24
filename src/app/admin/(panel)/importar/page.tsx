import { Download } from "lucide-react";
import type { Metadata } from "next";
import { AdminPage, buttonClass, Card } from "@/components/admin/ui";
import { requireAdmin } from "../../_lib/auth";
import { ImportWizard } from "./import-wizard";
import { SkuPhotoUploader } from "./photo-uploader";

// El admin se arma en el servidor en cada visita (lee la sesión): no se exige navegación instantánea.
export const instant = false;
export const metadata: Metadata = { title: "Carga masiva" };

export default async function ImportPage() {
  await requireAdmin();
  return (
    <AdminPage title="Carga masiva" description="Crea o actualiza muchos productos a la vez con un Excel, y sube sus fotos de una sola vez.">
      <div className="space-y-4">
        <Card title="1. Productos, precios y stock (Excel)">
          <ol className="mb-5 space-y-1 text-sm text-muted">
            <li>
              1. Descarga la plantilla (una fila por color y talla) o el catálogo actual para editarlo.
            </li>
            <li>2. Llénalo en Excel y súbelo aquí. Antes de guardar verás qué se crea y qué se actualiza.</li>
            <li>3. Si el SKU ya existe, se actualizan precio, stock y visibilidad. Si lo dejas vacío, se genera uno.</li>
          </ol>
          <div className="mb-5 flex flex-wrap gap-2">
            <a href="/admin/importar/plantilla.xlsx" className={buttonClass("secondary")}>
              <Download className="size-4" aria-hidden /> Plantilla vacía
            </a>
            <a href="/admin/importar/catalogo.xlsx" className={buttonClass("secondary")}>
              <Download className="size-4" aria-hidden /> Catálogo actual
            </a>
          </div>
          <ImportWizard />
        </Card>

        <Card title="2. Fotos por SKU">
          <p className="mb-4 text-sm text-muted">
            Nombra cada foto con el SKU de una de sus tallas: se asigna al producto y al color de ese SKU. La foto sin número es la principal;{" "}
            <span className="font-mono">_02</span>, <span className="font-mono">_03</span>… van después.
          </p>
          <SkuPhotoUploader />
        </Card>
      </div>
    </AdminPage>
  );
}
