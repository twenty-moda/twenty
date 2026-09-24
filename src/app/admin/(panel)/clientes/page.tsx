import type { Metadata } from "next";
import Link from "next/link";
import { AdminPage, EmptyState, formatDay, Pagination, SearchBox } from "@/components/admin/ui";
import { formatPrice } from "@/lib/money";
import { getDb } from "@/server/db/client";
import { listCustomers } from "@/server/services/orders";
import { requireAdmin } from "../../_lib/auth";

// Lista filtrada por la URL (estado, búsqueda, página): se arma en el servidor en cada visita.
export const instant = false;

export const metadata: Metadata = { title: "Clientes" };

export default async function CustomersPage({ searchParams }: PageProps<"/admin/clientes">) {
  await requireAdmin();
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q : undefined;
  const page = Number(params.pagina) || 1;
  const result = await listCustomers(getDb(), { q, page });

  return (
    <AdminPage title="Clientes" description={`${result.total} ${result.total === 1 ? "cliente" : "clientes"} que compraron en la web.`}>
      <SearchBox placeholder="Buscar por nombre, email, celular o DNI" defaultValue={q} />
      <div className="mt-5">
        {result.rows.length === 0 ? (
          <EmptyState title={q ? `Sin resultados para “${q}”` : "Aún no hay clientes"}>Se registran solos al hacer su primer pedido.</EmptyState>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line">
            {result.rows.map((c) => (
              <li key={c.id}>
                <Link href={`/admin/clientes/${c.id}`} className="flex items-center gap-4 px-4 py-3 hover:bg-surface">
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-raised text-sm font-semibold uppercase">
                    {c.name.slice(0, 1)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{c.name}</span>
                    <span className="block truncate text-xs text-muted">
                      {c.phone} · {c.email}
                    </span>
                  </span>
                  <span className="text-right text-sm">
                    <span className="block font-semibold">{formatPrice(c.spentCents)}</span>
                    <span className="block text-xs text-muted">
                      {c.orders} {c.orders === 1 ? "pedido" : "pedidos"}
                      {c.lastOrderAt ? ` · ${formatDay(c.lastOrderAt)}` : ""}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <Pagination page={result.page} pageCount={result.pageCount} href={(p) => `/admin/clientes?${new URLSearchParams({ ...(q ? { q } : {}), pagina: String(p) })}`} />
      </div>
    </AdminPage>
  );
}
