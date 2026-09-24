import { ArrowLeft, ChevronLeft, ChevronRight, Search } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { STATUS_INFO, type OrderStatus } from "@/lib/order-status";

export const buttonClass = (variant: "primary" | "secondary" | "danger" | "ghost" = "secondary", size: "md" | "sm" = "md") =>
  cn(
    "inline-flex shrink-0 items-center justify-center gap-2 rounded-full font-semibold transition disabled:cursor-not-allowed disabled:opacity-50",
    size === "md" ? "h-11 px-5 text-sm" : "h-9 px-4 text-xs",
    variant === "primary" && "bg-white text-black hover:bg-sections",
    variant === "secondary" && "border border-line hover:border-white/50",
    variant === "danger" && "border border-danger/60 text-danger hover:bg-danger/10",
    variant === "ghost" && "text-muted hover:text-white",
  );

type AdminPageProps = {
  title: ReactNode;
  description?: ReactNode;
  back?: { href: string; label: string };
  actions?: ReactNode;
  children: ReactNode;
};

export function AdminPage({ title, description, back, actions, children }: AdminPageProps) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-6 lg:px-8 lg:py-8">
      {back ? (
        <Link href={back.href} className="-ml-1 mb-2 inline-flex min-h-10 items-center gap-1 text-sm text-muted hover:text-white">
          <ArrowLeft className="size-4" aria-hidden /> {back.label}
        </Link>
      ) : null}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>
          {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
      {children}
    </div>
  );
}

export function Card({ title, actions, children, className }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-2xl border border-line bg-surface", className)}>
      {title ? (
        <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
          <h2 className="font-semibold">{title}</h2>
          {actions}
        </header>
      ) : null}
      <div className="p-5">{children}</div>
    </section>
  );
}

const TONES = {
  neutral: "bg-raised text-muted",
  warning: "bg-warning/15 text-warning",
  info: "bg-info/20 text-[#8fb2ff]",
  success: "bg-success/15 text-success",
  danger: "bg-danger/15 text-danger",
};

export function Badge({ tone = "neutral", children }: { tone?: keyof typeof TONES; children: ReactNode }) {
  return <span className={cn("inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap", TONES[tone])}>{children}</span>;
}

export function StatusBadge({ status }: { status: OrderStatus }) {
  const info = STATUS_INFO[status];
  return <Badge tone={info.tone}>{info.label}</Badge>;
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-line px-6 py-14 text-center">
      <p className="font-semibold">{title}</p>
      {children ? <div className="mt-2 text-sm text-muted">{children}</div> : null}
    </div>
  );
}

/** Buscador con GET: el filtro queda en la URL (se puede compartir y volver atrás). */
export function SearchBox({ placeholder, defaultValue, hidden }: { placeholder: string; defaultValue?: string; hidden?: Record<string, string | undefined> }) {
  return (
    <form role="search" className="relative w-full sm:max-w-sm">
      {Object.entries(hidden ?? {}).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
      <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted" aria-hidden />
      <input
        type="search"
        name="q"
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="h-11 w-full rounded-full border border-line bg-raised pr-4 pl-11 text-sm outline-none focus:border-white"
      />
    </form>
  );
}

export function Pagination({ page, pageCount, href }: { page: number; pageCount: number; href: (page: number) => string }) {
  if (pageCount <= 1) return null;
  return (
    <nav aria-label="Páginas" className="mt-6 flex items-center justify-center gap-3 text-sm">
      {page > 1 ? (
        <Link href={href(page - 1)} className={buttonClass("secondary", "sm")}>
          <ChevronLeft className="size-4" aria-hidden /> Anterior
        </Link>
      ) : null}
      <span className="text-muted">
        Página {page} de {pageCount}
      </span>
      {page < pageCount ? (
        <Link href={href(page + 1)} className={buttonClass("secondary", "sm")}>
          Siguiente <ChevronRight className="size-4" aria-hidden />
        </Link>
      ) : null}
    </nav>
  );
}

/** Filtros tipo pestaña (estado de pedido, etc.) como enlaces. */
export function FilterTabs({ items }: { items: { href: string; label: string; count?: number; active: boolean }[] }) {
  return (
    <nav aria-label="Filtros" className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-wrap lg:px-0">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={item.active ? "page" : undefined}
          className={cn(
            "inline-flex h-9 shrink-0 items-center gap-2 rounded-full border px-4 text-sm whitespace-nowrap",
            item.active ? "border-white bg-white font-semibold text-black" : "border-line hover:border-white/40",
          )}
        >
          {item.label}
          {item.count !== undefined ? <span className={cn("text-xs tabular-nums", item.active ? "text-black/60" : "text-subtle")}>{item.count}</span> : null}
        </Link>
      ))}
    </nav>
  );
}

const dateFormat = new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
const dayFormat = new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", day: "2-digit", month: "short", year: "numeric" });

/** Fecha en hora de Lima (el admin siempre se renderiza en el servidor). */
export const formatDateTime = (d: Date | string) => dateFormat.format(new Date(d));
export const formatDay = (d: Date | string) => dayFormat.format(new Date(d));
