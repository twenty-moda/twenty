import { describe, expect, it } from "vitest";
import { byLimaDay, getVisitsReport, webAnalyticsClient } from "./web-analytics";

const HOUR = 60 * 60 * 1000;
const config = { token: "vcp_test", projectId: "prj_test", teamId: "team_test" };
/** Inicio del 20/10/2026 en Lima (05:00 UTC). */
const since = new Date("2026-10-20T05:00:00.000Z");

function fakeFetch(respond: (url: URL) => { status?: number; body: unknown }) {
  const calls: { url: URL; init?: RequestInit }[] = [];
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    const parsed = new URL(url);
    calls.push({ url: parsed, init });
    const { status = 200, body } = respond(parsed);
    return new Response(JSON.stringify(body), { status });
  }) as typeof fetch;
  return { calls, fetchImpl };
}

describe("webAnalyticsClient", () => {
  it("pide el rango con el token, el proyecto y el equipo, sin que entre la hora siguiente", async () => {
    const { calls, fetchImpl } = fakeFetch(() => ({ body: { data: [{ environment: "production", visitors: 12, pageviews: 30 }] } }));
    const client = webAnalyticsClient(config, fetchImpl);
    expect(await client.totals(since, new Date(since.getTime() + 24 * HOUR))).toEqual({ visitors: 12, pageviews: 30 });
    const { url, init } = calls[0];
    expect(url.pathname).toBe("/v1/query/web-analytics/visits/aggregate");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      projectId: "prj_test",
      teamId: "team_test",
      by: "environment",
      since: "2026-10-20T05:00:00.000Z",
      until: "2026-10-21T04:59:59.999Z",
    });
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer vcp_test");
  });

  it("por hora parte el rango en tramos de 168 horas (el máximo de la API)", async () => {
    const { calls, fetchImpl } = fakeFetch(() => ({ body: { data: [] } }));
    await webAnalyticsClient(config, fetchImpl).hourly(since, new Date(since.getTime() + 30 * 24 * HOUR));
    const spans = calls.map(({ url }) => (Date.parse(url.searchParams.get("until")!) + 1 - Date.parse(url.searchParams.get("since")!)) / HOUR);
    expect(spans).toEqual([168, 168, 168, 168, 48]);
    expect(calls[1].url.searchParams.get("since")).toBe(new Date(since.getTime() + 168 * HOUR).toISOString());
  });

  it("desglose: de más a menos páginas vistas y «Others» al final; un error trae el código y el motivo", async () => {
    const { fetchImpl } = fakeFetch(() => ({
      body: {
        data: [
          { route: "Others", visitors: 9, pageviews: 40 },
          { route: "/catalogo", visitors: 3, pageviews: 5 },
          { route: "/", visitors: 8, pageviews: 12 },
        ],
      },
    }));
    expect((await webAnalyticsClient(config, fetchImpl).top("route", since, new Date())).map((r) => r.key)).toEqual(["/", "/catalogo", "Others"]);

    const denied = fakeFetch(() => ({ status: 403, body: { error: { code: "forbidden", message: "Not authorized" } } }));
    await expect(webAnalyticsClient(config, denied.fetchImpl).top("route", since, new Date())).rejects.toMatchObject({
      status: 403,
      message: expect.stringContaining("Not authorized"),
    });
  });
});

describe("getVisitsReport", () => {
  it("varios días: suma las horas por día de Lima; un día: las 24 horas", async () => {
    const { calls, fetchImpl } = fakeFetch((url) => {
      if (url.searchParams.get("by") !== "hour") return { body: { data: [] } };
      return {
        body: {
          data: [
            { timestamp: "2026-10-20T05:00:00.000Z", visitors: 1, pageviews: 2 },
            // 20/10 a las 23:00 en Lima: sigue siendo el 20 (en UTC ya es el 21).
            { timestamp: "2026-10-21T04:00:00.000Z", visitors: 2, pageviews: 3 },
            { timestamp: "2026-10-21T05:00:00.000Z", visitors: 1, pageviews: 7 },
          ],
        },
      };
    });
    const client = webAnalyticsClient(config, fetchImpl);
    const week = await getVisitsReport(client, since, 7);
    expect(week.series.map((d) => d.pageviews)).toEqual([5, 7, 0, 0, 0, 0, 0]);
    expect(week.series[1].at).toBe(Date.parse("2026-10-21T05:00:00.000Z"));

    // Las prendas con el máximo de la API: si no, la mayoría queda en "Others" sin decir cuáles son.
    const products = calls.find(({ url }) => url.searchParams.get("by") === "requestPath")!.url.searchParams;
    expect([products.get("limit"), products.get("filter")]).toEqual(["100", "route eq '/product/[slug]'"]);

    const day = await getVisitsReport(client, since, 1);
    expect(day.series).toHaveLength(24);
    expect(day.series[0].pageviews).toBe(2);
    expect(day.series[23].pageviews).toBe(3);
  });
});

describe("byLimaDay", () => {
  it("ignora horas fuera del rango", () => {
    const series = byLimaDay([{ at: since.getTime() - HOUR, pageviews: 4 }, { at: since.getTime() + 2 * 24 * HOUR, pageviews: 4 }], since, 2);
    expect(series.map((d) => d.pageviews)).toEqual([0, 0]);
  });
});
