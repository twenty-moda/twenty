/**
 * Visitas de la tienda para /admin/visitas, desde la API de Vercel Web Analytics (`GET /v1/query/web-analytics/visits/…`).
 * Llave: un token de la cuenta de Vercel de TWENTY limitado al proyecto (VERCEL_ANALYTICS_TOKEN) + VERCEL_ANALYTICS_PROJECT_ID
 * y VERCEL_ANALYTICS_TEAM_ID. Speed Insights no tiene API para leer sus datos: el panel enlaza a Vercel.
 *
 * Lo que impone la API (probado el 23/10/2026): en Hobby solo los últimos 31 días; por hora, como mucho 168 horas por
 * consulta; y los días los corta en UTC. Por eso todo se pide por hora y los días de Lima (UTC-5) se arman aquí.
 */

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
/** Máximo de horas por consulta con `by=hour`. */
const MAX_HOURS = 168;

export type VisitCounts = { visitors: number; pageviews: number };
/** Una fila de un desglose. `key` = "Others" junta lo que no entró en el límite. */
export type VisitsRow = VisitCounts & { key: string };
/** Las utm_* no: piden Enterprise o Web Analytics Plus (402). */
export type Dimension = "route" | "requestPath" | "referrerHostname" | "deviceType" | "country";

export type WebAnalyticsClient = {
  /** Totales del rango [since, until). */
  totals(since: Date, until: Date): Promise<VisitCounts>;
  /** Páginas vistas por hora (inicio de cada hora en ms), del rango [since, until). */
  hourly(since: Date, until: Date): Promise<{ at: number; pageviews: number }[]>;
  /** Desglose por una dimensión, de más a menos páginas vistas ("Others" al final). */
  top(by: Dimension, since: Date, until: Date, options?: { filter?: string; limit?: number }): Promise<VisitsRow[]>;
};

export class WebAnalyticsError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

type Config = { token: string; projectId: string; teamId: string };

export function webAnalyticsClient({ token, projectId, teamId }: Config, fetchImpl: typeof fetch = fetch): WebAnalyticsClient {
  const aggregate = async (by: string, since: Date, until: Date, extra: Record<string, string> = {}) => {
    // `until` cuenta la hora que lo contiene: con el último milisegundo del rango no entra la hora siguiente.
    const params = new URLSearchParams({ projectId, teamId, by, since: since.toISOString(), until: new Date(until.getTime() - 1).toISOString(), ...extra });
    const res = await fetchImpl(`https://api.vercel.com/v1/query/web-analytics/visits/aggregate?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15_000),
    });
    const body = (await res.json().catch(() => null)) as { data?: unknown; error?: { message?: unknown } } | null;
    if (res.status !== 200 || !Array.isArray(body?.data)) {
      const message = typeof body?.error?.message === "string" ? `: ${body.error.message}` : "";
      throw new WebAnalyticsError(`Vercel respondió ${res.status} al pedir las visitas por ${by}${message}`, res.status);
    }
    return body.data as Record<string, unknown>[];
  };
  const counts = (row: Record<string, unknown>): VisitCounts => ({ visitors: Number(row.visitors) || 0, pageviews: Number(row.pageviews) || 0 });

  return {
    async totals(since, until) {
      // Sin dimensión no se puede: por entorno sale una sola fila (la API ya filtra producción).
      const rows = await aggregate("environment", since, until);
      return rows.map(counts).reduce((sum, r) => ({ visitors: sum.visitors + r.visitors, pageviews: sum.pageviews + r.pageviews }), { visitors: 0, pageviews: 0 });
    },
    async hourly(since, until) {
      const chunks: [Date, Date][] = [];
      for (let start = since.getTime(); start < until.getTime(); start += MAX_HOURS * HOUR) {
        chunks.push([new Date(start), new Date(Math.min(start + MAX_HOURS * HOUR, until.getTime()))]);
      }
      const parts = await Promise.all(chunks.map(([from, to]) => aggregate("hour", from, to)));
      return parts.flat().map((row) => ({ at: Date.parse(String(row.timestamp)), pageviews: counts(row).pageviews }));
    },
    async top(by, since, until, { filter, limit = 10 } = {}) {
      const rows = await aggregate(by, since, until, { limit: String(limit), ...(filter ? { filter } : {}) });
      return rows
        .map((row) => ({ key: String(row[by] ?? ""), ...counts(row) }))
        .sort((a, b) => Number(a.key === "Others") - Number(b.key === "Others") || b.pageviews - a.pageviews);
    },
  };
}

export function webAnalyticsFromEnv(): WebAnalyticsClient | null {
  const token = process.env.VERCEL_ANALYTICS_TOKEN;
  const projectId = process.env.VERCEL_ANALYTICS_PROJECT_ID;
  const teamId = process.env.VERCEL_ANALYTICS_TEAM_ID;
  return token && projectId && teamId ? webAnalyticsClient({ token, projectId, teamId }) : null;
}

export type VisitsReport = {
  totals: VisitCounts;
  /** Páginas vistas por hora (un día) o por día de Lima (varios). `at` = inicio del tramo en ms. */
  series: { at: number; pageviews: number }[];
  /** Por tipo de página (`/product/[slug]`, `/catalogo`…). */
  pages: VisitsRow[];
  /** Fichas de producto más vistas (`/product/<slug>`). */
  products: VisitsRow[];
  /** Por sitio de origen ("" = sin enlace: escribieron la dirección, un favorito o una app que no lo dice). */
  sources: VisitsRow[];
  devices: VisitsRow[];
  countries: VisitsRow[];
};

/** Todo lo que muestra /admin/visitas para `days` días de Lima desde `since` (inicio de un día de Lima). */
export async function getVisitsReport(client: WebAnalyticsClient, since: Date, days: number): Promise<VisitsReport> {
  const until = new Date(since.getTime() + days * DAY);
  // Límites altos: lo que no entra la API lo junta en "Others", que no dice qué es (100 es el máximo).
  const [totals, hourly, pages, products, sources, devices, countries] = await Promise.all([
    client.totals(since, until),
    client.hourly(since, until),
    client.top("route", since, until, { limit: 50 }),
    client.top("requestPath", since, until, { filter: "route eq '/product/[slug]'", limit: 100 }),
    client.top("referrerHostname", since, until, { limit: 50 }),
    client.top("deviceType", since, until),
    client.top("country", since, until),
  ]);
  return { totals, series: days === 1 ? fillHours(hourly, since) : byLimaDay(hourly, since, days), pages, products, sources, devices, countries };
}

/** Las 24 horas del día, también las que no tuvieron visitas. */
function fillHours(hourly: { at: number; pageviews: number }[], since: Date) {
  return Array.from({ length: 24 }, (_, i) => {
    const at = since.getTime() + i * HOUR;
    return { at, pageviews: hourly.find((h) => h.at === at)?.pageviews ?? 0 };
  });
}

/** Suma las horas en días de Lima: `since` es el inicio de un día de Lima, así que cada 24 horas desde ahí es un día. */
export function byLimaDay(hourly: { at: number; pageviews: number }[], since: Date, days: number) {
  const series = Array.from({ length: days }, (_, i) => ({ at: since.getTime() + i * DAY, pageviews: 0 }));
  for (const h of hourly) {
    const day = Math.floor((h.at - since.getTime()) / DAY);
    if (day >= 0 && day < days) series[day].pageviews += h.pageviews;
  }
  return series;
}
