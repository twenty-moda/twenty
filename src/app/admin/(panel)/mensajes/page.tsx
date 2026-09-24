import { Download, Mail, MessageCircle } from "lucide-react";
import type { Metadata } from "next";
import { AdminPage, buttonClass, EmptyState, FilterTabs, formatDateTime, formatDay, Pagination, SearchBox } from "@/components/admin/ui";
import { whatsappUrl } from "@/lib/links";
import { getDb } from "@/server/db/client";
import { countNewMessages, listContactMessages, listSubscribers, type MessageFilter } from "@/server/services/messages";
import { requireAdmin } from "../../_lib/auth";
import { DeleteSubscriberButton, HandledButton } from "./message-actions";

export const instant = false;
export const metadata: Metadata = { title: "Mensajes" };

const FILTERS: { value: MessageFilter; label: string }[] = [
  { value: "nuevos", label: "Nuevos" },
  { value: "atendidos", label: "Atendidos" },
  { value: "todos", label: "Todos" },
];

export default async function MessagesPage({ searchParams }: PageProps<"/admin/mensajes">) {
  await requireAdmin();
  const params = await searchParams;
  const view = params.vista === "suscriptores" ? "suscriptores" : "mensajes";
  const filter = FILTERS.find((f) => f.value === params.estado)?.value ?? "nuevos";
  const q = typeof params.q === "string" ? params.q : undefined;
  const page = Number(params.pagina) || 1;
  const db = getDb();
  const [newCount, subscribers] = await Promise.all([countNewMessages(db), listSubscribers(db)]);

  const tabs = [
    ...FILTERS.map((f) => ({ href: `/admin/mensajes?estado=${f.value}`, label: f.label, count: f.value === "nuevos" ? newCount : undefined, active: view === "mensajes" && filter === f.value })),
    { href: "/admin/mensajes?vista=suscriptores", label: "Suscriptores", count: subscribers.length, active: view === "suscriptores" },
  ];

  if (view === "suscriptores") {
    return (
      <AdminPage
        title="Mensajes"
        description="Suscriptores del boletín (formulario del pie de página)."
        actions={
          subscribers.length ? (
            <a href="/admin/mensajes/suscriptores.xlsx" className={buttonClass("secondary")}>
              <Download className="size-4" aria-hidden /> Descargar Excel
            </a>
          ) : null
        }
      >
        <FilterTabs items={tabs} />
        <div className="mt-5">
          {subscribers.length === 0 ? (
            <EmptyState title="Aún no hay suscriptores">Se suman desde el pie de página de la tienda.</EmptyState>
          ) : (
            <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line">
              {subscribers.map((s) => (
                <li key={s.id} className="flex items-center gap-3 px-4 py-2">
                  <span className="min-w-0 flex-1 truncate">{s.email}</span>
                  <span className="text-xs text-muted">{formatDay(s.createdAt)}</span>
                  <DeleteSubscriberButton id={s.id} email={s.email} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </AdminPage>
    );
  }

  const result = await listContactMessages(db, { filter, q, page });
  return (
    <AdminPage title="Mensajes" description="Lo que escriben en el formulario de Contacto. Respóndeles por WhatsApp o email y márcalos como atendidos.">
      <FilterTabs items={tabs} />
      <div className="mt-4">
        <SearchBox placeholder="Buscar por nombre, email, celular o texto" defaultValue={q} hidden={{ estado: filter }} />
      </div>
      <div className="mt-5 space-y-3">
        {result.rows.length === 0 ? (
          <EmptyState title={q ? `Sin resultados para “${q}”` : filter === "nuevos" ? "No hay mensajes nuevos" : "No hay mensajes"}>
            {filter === "nuevos" ? "Todo al día." : null}
          </EmptyState>
        ) : (
          result.rows.map((m) => (
            <article key={m.id} className="rounded-2xl border border-line bg-surface p-4 md:p-5">
              <header className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-semibold">{m.name}</h2>
                <time className="text-xs text-muted" dateTime={m.createdAt.toISOString()}>
                  {formatDateTime(m.createdAt)}
                </time>
              </header>
              <p className="mt-1 text-sm text-muted">
                {m.email}
                {m.phone ? ` · ${m.phone}` : ""}
              </p>
              <p className="mt-3 text-sm leading-relaxed whitespace-pre-line">{m.message}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {m.phone ? (
                  <a href={whatsappUrl(m.phone.length === 9 ? `51${m.phone}` : m.phone, `Hola ${m.name.split(" ")[0]}, te escribimos de TWENTY por tu mensaje en la web.`)} target="_blank" rel="noopener noreferrer" className={buttonClass("secondary", "sm")}>
                    <MessageCircle className="size-4" aria-hidden /> WhatsApp
                  </a>
                ) : null}
                <a href={`mailto:${m.email}?subject=${encodeURIComponent("Tu mensaje a TWENTY")}`} className={buttonClass("secondary", "sm")}>
                  <Mail className="size-4" aria-hidden /> Email
                </a>
                <HandledButton id={m.id} handled={!!m.handledAt} />
              </div>
            </article>
          ))
        )}
        <Pagination page={page} pageCount={result.pageCount} href={(p) => `/admin/mensajes?${new URLSearchParams({ estado: filter, ...(q ? { q } : {}), pagina: String(p) })}`} />
      </div>
    </AdminPage>
  );
}
