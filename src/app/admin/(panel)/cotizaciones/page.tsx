import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AdminPage, Badge, buttonClass, EmptyState, FilterTabs, formatDateTime, Pagination, SearchBox } from "@/components/admin/ui";
import { formatPrice } from "@/lib/money";
import { getDb } from "@/server/db/client";
import { formatQuoteNumber, listQuotes, type QuoteListStatus } from "@/server/services/quotes";
import { requireStaff } from "../../_lib/auth";

export const instant = false;
export const metadata: Metadata = { title: "Cotizaciones" };

const TABS: { value: QuoteListStatus | undefined; label: string }[] = [
  { value: "vigente", label: "Vigentes" },
  { value: "vencida", label: "Vencidas" },
  { value: "vendida", label: "Vendidas" },
  { value: "anulada", label: "Anuladas" },
  { value: undefined, label: "Todas" },
];
const day = (iso: string) => iso.split("-").reverse().join("/");

/** Cotizaciones para clientes mayoristas: vigentes primero; cada una se imprime, se manda o se vende en el punto de venta. */
export default async function QuotesPage({ searchParams }: PageProps<"/admin/cotizaciones">) {
  await requireStaff();
  const params = await searchParams;
  const q = typeof params.q === "string" && params.q.trim() ? params.q : undefined;
  const status = TABS.find((t) => t.value && t.value === params.estado)?.value ?? (params.estado === "todas" ? undefined : "vigente");
  const page = Number(params.pagina) || 1;
  const result = await listQuotes(getDb(), { q, status, page });
  const href = (over: Record<string, string | undefined>) => {
    const p = new URLSearchParams(Object.entries({ estado: status ?? "todas", q, ...over }).filter((e): e is [string, string] => !!e[1]));
    return `/admin/cotizaciones?${p}`;
  };

  return (
    <AdminPage
      title="Cotizaciones"
      description="Para clientes mayoristas: prendas con precio por unidad, para imprimir, mandar por WhatsApp y vender en el punto de venta cuando confirman."
      actions={
        <Link href="/admin/cotizaciones/nueva" className={buttonClass("primary")}>
          <Plus className="size-4" aria-hidden /> Nueva cotización
        </Link>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <FilterTabs items={TABS.map((t) => ({ href: href({ estado: t.value ?? "todas", pagina: undefined }), label: t.label, active: t.value === status }))} />
          <SearchBox placeholder="Buscar COT-12, cliente, RUC o celular" defaultValue={q} hidden={{ estado: status ?? "todas" }} />
        </div>
        {result.rows.length === 0 ? (
          <EmptyState title={q ? `Sin resultados para “${q}”` : "No hay cotizaciones aquí"}>
            <Link href="/admin/cotizaciones/nueva" className="underline">
              Hacer una cotización
            </Link>
          </EmptyState>
        ) : (
          <>
            <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line">
              {result.rows.map((r) => {
                const expired = r.status === "vigente" && r.validUntil < result.today;
                return (
                  <li key={r.id}>
                    <Link href={`/admin/cotizaciones/${r.number}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm hover:bg-surface">
                      <span className="w-24 font-mono font-semibold">{formatQuoteNumber(r.number)}</span>
                      <span className="min-w-[12rem] flex-1">
                        {r.customerName}
                        <span className="block text-xs text-subtle">
                          {formatDateTime(r.createdAt)}
                          {r.customerDocumentNumber ? ` · ${r.customerDocumentNumber}` : ""}
                          {r.userName ? ` · ${r.userName}` : ""}
                        </span>
                      </span>
                      <span className="text-xs text-muted">
                        {r.units} prendas · hasta {day(r.validUntil)}
                      </span>
                      {r.status === "vendida" ? <Badge tone="success">Vendida</Badge> : r.status === "anulada" ? <Badge tone="danger">Anulada</Badge> : expired ? <Badge tone="warning">Vencida</Badge> : <Badge tone="info">Vigente</Badge>}
                      <span className="w-24 text-right font-semibold tabular-nums">{formatPrice(r.totalCents)}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
            <Pagination page={result.page} pageCount={result.pageCount} href={(p) => href({ pagina: String(p) })} />
          </>
        )}
      </div>
    </AdminPage>
  );
}
