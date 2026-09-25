import { Download, Mail, MessageCircle } from "lucide-react";
import type { Metadata } from "next";
import { AdminPage, buttonClass, EmptyState, FilterTabs, formatDateTime, formatDay, Pagination, SearchBox } from "@/components/admin/ui";
import { getDb } from "@/server/db/client";
import { getSiteSettings } from "@/server/services/content";
import { emailConfigured } from "@/server/services/email";
import { countNewMessages, listContactMessages, listSubscribers, type MessageFilter } from "@/server/services/messages";
import { contactReplyTo } from "@/server/services/notifications";
import { requireAdmin } from "../../_lib/auth";
import { DeleteSubscriberButton, MessageActions } from "./message-actions";

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

  const [result, settings] = await Promise.all([listContactMessages(db, { filter, q, page }), getSiteSettings(db)]);
  const emailEnabled = emailConfigured();
  const replyTo = contactReplyTo(settings);
  return (
    <AdminPage title="Mensajes" description="Lo que escriben en el formulario de Contacto. Respóndeles por email o WhatsApp desde aquí: al responder pasan solos a Atendidos.">
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
              {m.replies.length ? (
                <ul className="mt-4 space-y-3">
                  {m.replies.map((r) => (
                    <li key={r.id} className="border-l-2 border-line pl-3 text-sm">
                      <p className="flex items-center gap-1.5 text-xs text-muted">
                        {r.channel === "email" ? <Mail className="size-3.5" aria-hidden /> : <MessageCircle className="size-3.5" aria-hidden />}
                        {r.channel === "email" ? "Respondido por email" : "Respondido por WhatsApp"}
                        {r.sentByName ? ` · ${r.sentByName}` : ""} · {formatDateTime(r.createdAt)}
                      </p>
                      <p className="mt-1 leading-relaxed whitespace-pre-line text-muted">{r.body}</p>
                    </li>
                  ))}
                </ul>
              ) : null}
              <MessageActions
                id={m.id}
                name={m.name}
                email={m.email}
                whatsapp={m.phone ? (m.phone.length === 9 ? `51${m.phone}` : m.phone) : null}
                handled={!!m.handledAt}
                emailEnabled={emailEnabled}
                replyTo={replyTo}
              />
            </article>
          ))
        )}
        <Pagination page={page} pageCount={result.pageCount} href={(p) => `/admin/mensajes?${new URLSearchParams({ estado: filter, ...(q ? { q } : {}), pagina: String(p) })}`} />
      </div>
    </AdminPage>
  );
}
