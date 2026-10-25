import { ExternalLink, Gauge } from "lucide-react";
import type { Metadata } from "next";
import { cacheLife } from "next/cache";
import Image from "next/image";
import Link from "next/link";
import { getProductCards } from "@/app/(store)/_data";
import { AdminPage, buttonClass, Card, EmptyState, FilterTabs } from "@/components/admin/ui";
import { BarList, formatCount, VisitsChart } from "@/components/admin/visits";
import { countryLabel, deviceLabel, groupRows, OTHERS, routeLabel, sourceLabel } from "@/lib/analytics";
import { getDb } from "@/server/db/client";
import { countPaidOrders, startOfLimaDay } from "@/server/services/orders";
import { getVisitsReport, WebAnalyticsError, webAnalyticsFromEnv, type VisitsReport } from "@/server/services/web-analytics";
import { requireAdmin } from "../../_lib/auth";

// Lee la sesión y el rango de la URL: se arma en el servidor en cada visita.
export const instant = false;

export const metadata: Metadata = { title: "Visitas" };

const DAY = 24 * 60 * 60 * 1000;
const RANGES = { hoy: { label: "Hoy", days: 1 }, "7-dias": { label: "7 días", days: 7 }, "30-dias": { label: "30 días", days: 30 } } as const;
type Range = keyof typeof RANGES;
/** El proyecto en el panel de Vercel (se entra con la cuenta de TWENTY). */
const VERCEL_PROJECT = "https://vercel.com/twenty10/twentymoda";

const percent = new Intl.NumberFormat("es-PE", { style: "percent", maximumFractionDigits: 1 });

type Loaded = { report: VisitsReport } | { error: "config" | "token" | "api" };

/** Se guarda 10 minutos por rango: abrir o recargar el panel no vuelve a pedirle todo a Vercel. */
async function loadVisits(sinceMs: number, days: number): Promise<Loaded> {
  "use cache";
  const client = webAnalyticsFromEnv();
  if (!client) {
    cacheLife("minutes");
    return { error: "config" };
  }
  try {
    const report = await getVisitsReport(client, new Date(sinceMs), days);
    cacheLife({ stale: 300, revalidate: 600, expire: 3600 });
    return { report };
  } catch (error) {
    console.error("[visitas] No se pudieron cargar", error instanceof Error ? error.message : error);
    cacheLife("seconds");
    return { error: error instanceof WebAnalyticsError && (error.status === 401 || error.status === 403) ? "token" : "api" };
  }
}

export default async function VisitsPage({ searchParams }: PageProps<"/admin/visitas">) {
  await requireAdmin();
  const { rango } = await searchParams;
  const range: Range = typeof rango === "string" && Object.hasOwn(RANGES, rango) ? (rango as Range) : "7-dias";
  const { days } = RANGES[range];
  const now = new Date();
  const since = new Date(startOfLimaDay(now).getTime() - (days - 1) * DAY);
  const [loaded, paidOrders, cards] = await Promise.all([loadVisits(since.getTime(), days), countPaidOrders(getDb(), since, now), getProductCards()]);

  const tabs = (Object.keys(RANGES) as Range[]).map((r) => ({
    href: r === "7-dias" ? "/admin/visitas" : `/admin/visitas?rango=${r}`,
    label: RANGES[r].label,
    active: r === range,
  }));
  const actions = (
    <a href={`${VERCEL_PROJECT}/analytics`} target="_blank" rel="noopener noreferrer" className={buttonClass("secondary", "sm")}>
      Abrir en Vercel <ExternalLink className="size-3.5" aria-hidden />
    </a>
  );

  return (
    <AdminPage title="Visitas" description="Cuántos entran a la web, de dónde llegan y qué miran (hora de Lima)." actions={actions}>
      <FilterTabs items={tabs} />
      <div className="mt-5">
        {"error" in loaded ? <LoadError error={loaded.error} /> : <Report report={loaded.report} hourly={days === 1} paidOrders={paidOrders} cards={cards} now={now} />}
      </div>

      <Card className="mt-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <Gauge className="size-6 shrink-0 text-muted" aria-hidden />
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-semibold">Velocidad de la web</p>
            <p className="mt-1 text-muted">
              Lo rápido que carga en los teléfonos de los clientes está en Speed Insights de Vercel: Vercel no deja leerlo desde aquí.
            </p>
          </div>
          <a href={`${VERCEL_PROJECT}/speed-insights`} target="_blank" rel="noopener noreferrer" className={buttonClass("secondary", "sm")}>
            Ver en Vercel <ExternalLink className="size-3.5" aria-hidden />
          </a>
        </div>
      </Card>
    </AdminPage>
  );
}

function LoadError({ error }: { error: "config" | "token" | "api" }) {
  const messages = {
    config: ["Las visitas aún no están conectadas", "Falta la llave de Vercel en la configuración. Avísale a quien mantiene la web."],
    token: ["Vercel no aceptó la llave", "Venció o la borraron. Avísale a quien mantiene la web para crear otra."],
    api: ["Vercel no respondió", "Vuelve a intentarlo en unos minutos."],
  } as const;
  const [title, detail] = messages[error];
  return <EmptyState title={title}>{detail}</EmptyState>;
}

type Cards = Awaited<ReturnType<typeof getProductCards>>;

type ReportProps = { report: VisitsReport; hourly: boolean; paidOrders: number; cards: Cards; now: Date };

function Report({ report, hourly, paidOrders, cards, now }: ReportProps) {
  // Hoy: solo hasta la hora actual (las que faltan no son "cero visitas").
  const series = hourly ? report.series.filter((s) => s.at <= now.getTime()) : report.series;
  const { visitors, pageviews } = report.totals;
  const bySlug = new Map(cards.map((c) => [c.slug, c]));

  const products = report.products.map((row) => {
    if (row.key === OTHERS) {
      return { key: row.key, label: <span className="text-muted">Otras prendas (fuera de las 100 más vistas)</span>, value: row.pageviews, others: true };
    }
    const slug = row.key.replace(/^\/product\//, "");
    // Si ya no está en la tienda (archivada o con otro enlace), queda el enlace que se visitó.
    const card = bySlug.get(slug);
    const body = (
      <>
        <span className="relative aspect-3/4 w-8 shrink-0 overflow-hidden rounded bg-raised">
          {card?.image ? <Image src={card.image.path} alt="" fill sizes="32px" className="object-cover" /> : null}
        </span>
        <span className="truncate">{card?.name ?? slug}</span>
      </>
    );
    const label = card ? (
      <Link href={`/admin/productos/${card.id}`} className="flex min-w-0 items-center gap-3 hover:underline">
        {body}
      </Link>
    ) : (
      <span className="flex min-w-0 items-center gap-3 text-muted">{body}</span>
    );
    return { key: row.key, label, value: row.pageviews };
  });

  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Visitantes" value={formatCount(visitors)} />
        <Stat label="Páginas vistas" value={formatCount(pageviews)} hint={visitors ? `${(pageviews / visitors).toFixed(1)} por visitante` : undefined} />
        <Stat label="Pedidos pagados" value={formatCount(paidOrders)} />
        <Stat label="Conversión" value={visitors ? percent.format(paidOrders / visitors) : "—"} hint="Pedidos pagados ÷ visitantes" />
      </div>

      <Card title={hourly ? "Páginas vistas por hora" : "Páginas vistas por día"} className="mt-4">
        <VisitsChart series={series} unit={hourly ? "hour" : "day"} />
      </Card>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Prendas más vistas">
          <BarList rows={products} empty="Nadie abrió una prenda en estas fechas." />
        </Card>
        <Card title="De dónde llegan">
          <BarList rows={groupRows(report.sources, sourceLabel, "visitors")} />
        </Card>
        <Card title="Páginas">
          <BarList rows={groupRows(report.pages, routeLabel, "pageviews")} />
        </Card>
        <div className="space-y-4">
          <Card title="Dispositivo">
            <BarList rows={groupRows(report.devices, deviceLabel, "visitors")} />
          </Card>
          <Card title="Países">
            <BarList rows={groupRows(report.countries, countryLabel, "visitors")} />
          </Card>
        </div>
      </div>

      <p className="mt-4 text-xs text-subtle">
        Datos de Vercel Web Analytics, sin contar el panel; se actualizan cada 10 minutos. No usa cookies: quien vuelve otro día cuenta otra vez, y quien
        usa bloqueador de anuncios no se cuenta. «De dónde llegan», «Dispositivo» y «Países» cuentan visitantes; «Prendas» y «Páginas», páginas vistas.
      </p>
    </>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="h-full rounded-2xl border border-line bg-surface p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-2 text-2xl font-extrabold tracking-tight">{value}</p>
      {hint ? <p className="mt-1 text-xs text-subtle">{hint}</p> : null}
    </div>
  );
}
