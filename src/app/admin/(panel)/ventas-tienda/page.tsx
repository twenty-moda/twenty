import type { Metadata } from "next";
import Link from "next/link";
import { AdminPage, buttonClass, EmptyState, Pagination, SearchBox } from "@/components/admin/ui";
import { getDb } from "@/server/db/client";
import { listPosSales } from "@/server/services/pos";
import { requireAdmin } from "../../_lib/auth";
import { SalesList } from "./sales-list";

// Lista filtrada por la URL (búsqueda, página): se arma en el servidor en cada visita.
export const instant = false;
export const metadata: Metadata = { title: "Ventas en tienda" };

export default async function StoreSalesPage({ searchParams }: PageProps<"/admin/ventas-tienda">) {
  await requireAdmin();
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q : undefined;
  const page = Number(params.pagina) || 1;
  const result = await listPosSales(getDb(), { q, page });
  return (
    <AdminPage
      title="Ventas en tienda"
      description="Lo que se vendió en el punto de venta. Toca una venta para ver o reimprimir el ticket, o anularla."
      actions={
        <Link href="/admin/pos" className={buttonClass("primary")}>
          Vender
        </Link>
      }
    >
      <div className="mb-4">
        <SearchBox placeholder="Buscar NV05-12, cliente o DNI" defaultValue={q} />
      </div>
      {result.rows.length === 0 ? (
        <EmptyState title={q ? `Sin resultados para “${q}”` : "Aún no hay ventas en tienda"} />
      ) : (
        <>
          <SalesList rows={result.rows} />
          <Pagination page={result.page} pageCount={result.pageCount} href={(p) => `/admin/ventas-tienda?${new URLSearchParams({ ...(q ? { q } : {}), pagina: String(p) })}`} />
        </>
      )}
    </AdminPage>
  );
}
