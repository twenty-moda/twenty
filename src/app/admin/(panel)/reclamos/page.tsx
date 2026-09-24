import type { Metadata } from "next";
import Link from "next/link";
import { AdminPage, Badge, EmptyState, FilterTabs, formatDay, Pagination, SearchBox } from "@/components/admin/ui";
import { COMPLAINT_TYPES } from "@/lib/public-forms";
import { getDb } from "@/server/db/client";
import { countPendingComplaints, listComplaints, type ComplaintFilter } from "@/server/services/complaints";
import { requireAdmin } from "../../_lib/auth";
import { DeadlineBadge } from "./deadline-badge";

export const instant = false;
export const metadata: Metadata = { title: "Libro de Reclamaciones" };

const FILTERS: { value: ComplaintFilter; label: string }[] = [
  { value: "pendientes", label: "Por responder" },
  { value: "respondidos", label: "Respondidos" },
  { value: "todos", label: "Todos" },
];

export default async function ComplaintsPage({ searchParams }: PageProps<"/admin/reclamos">) {
  await requireAdmin();
  const params = await searchParams;
  const filter = FILTERS.find((f) => f.value === params.estado)?.value ?? "pendientes";
  const q = typeof params.q === "string" ? params.q : undefined;
  const page = Number(params.pagina) || 1;
  const db = getDb();
  const [result, pending] = await Promise.all([listComplaints(db, { filter, q, page }), countPendingComplaints(db)]);

  return (
    <AdminPage title="Libro de Reclamaciones" description="Por ley hay que responder cada reclamo o queja en máximo 15 días hábiles y guardar las hojas al menos 2 años.">
      <FilterTabs items={FILTERS.map((f) => ({ href: `/admin/reclamos?estado=${f.value}`, label: f.label, count: f.value === "pendientes" ? pending : undefined, active: filter === f.value }))} />
      <div className="mt-4">
        <SearchBox placeholder="Buscar por N°, nombre, email, DNI o pedido" defaultValue={q} hidden={{ estado: filter }} />
      </div>
      <div className="mt-5">
        {result.rows.length === 0 ? (
          <EmptyState title={q ? `Sin resultados para “${q}”` : filter === "pendientes" ? "No hay reclamos por responder" : "No hay reclamos"}>
            Llegan desde la página Libro de Reclamaciones de la tienda.
          </EmptyState>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line">
            {result.rows.map((c) => (
              <li key={c.id}>
                <Link href={`/admin/reclamos/${c.number}`} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 hover:bg-surface">
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="font-semibold tabular-nums">{c.code}</span>
                      <Badge tone={c.type === "reclamo" ? "info" : "neutral"}>{COMPLAINT_TYPES[c.type].label}</Badge>
                    </span>
                    <span className="mt-0.5 block truncate text-sm text-muted">
                      {c.name} · {formatDay(c.createdAt)} · {c.itemDescription}
                    </span>
                  </span>
                  <DeadlineBadge daysLeft={c.daysLeft} />
                </Link>
              </li>
            ))}
          </ul>
        )}
        <Pagination page={page} pageCount={result.pageCount} href={(p) => `/admin/reclamos?${new URLSearchParams({ estado: filter, ...(q ? { q } : {}), pagina: String(p) })}`} />
      </div>
    </AdminPage>
  );
}
