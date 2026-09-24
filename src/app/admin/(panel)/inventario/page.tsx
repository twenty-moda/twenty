import { Download } from "lucide-react";
import type { Metadata } from "next";
import { AdminPage, buttonClass, EmptyState, FilterTabs, SearchBox } from "@/components/admin/ui";
import { getDb } from "@/server/db/client";
import { listInventory } from "@/server/services/admin-products";
import { requireAdmin } from "../../_lib/auth";
import { InventoryEditor } from "./inventory-editor";

export const instant = false;
export const metadata: Metadata = { title: "Stock y precios" };

export default async function InventoryPage({ searchParams }: PageProps<"/admin/inventario">) {
  await requireAdmin();
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q : undefined;
  const low = params.bajo === "1";
  const rows = await listInventory(getDb(), { q, low });

  return (
    <AdminPage
      title="Stock y precios"
      description="Cambia varias prendas y guarda todo junto. Para cambios grandes, descarga el Excel, edítalo y súbelo en Carga masiva."
      actions={
        <a href="/admin/importar/catalogo.xlsx" className={buttonClass("secondary")}>
          <Download className="size-4" aria-hidden /> Descargar Excel
        </a>
      }
    >
      <div className="mb-4 space-y-4">
        <SearchBox placeholder="Buscar producto, color o SKU" defaultValue={q} hidden={{ bajo: low ? "1" : undefined }} />
        <FilterTabs
          items={[
            { href: `/admin/inventario${q ? `?q=${encodeURIComponent(q)}` : ""}`, label: "Todo", active: !low },
            { href: `/admin/inventario?bajo=1${q ? `&q=${encodeURIComponent(q)}` : ""}`, label: "Stock bajo (2 o menos)", active: low },
          ]}
        />
      </div>
      {rows.length ? <InventoryEditor key={`${q}-${low}`} rows={rows} /> : <EmptyState title="Nada con ese filtro" />}
    </AdminPage>
  );
}
