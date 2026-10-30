import { describe, expect, it } from "vitest";
import { igvSplit } from "./pos";
import { bucketKeys, bucketUnit, formatLimaDate, rangePresets, reportRange, toCsv } from "./reports";

// 30/10/2026 a las 21:00 en Lima (ya es 31 en UTC).
const now = new Date("2026-10-31T02:00:00Z");

describe("reportRange", () => {
  it("sin fechas: este mes hasta hoy, en días de Lima", () => {
    const r = reportRange(undefined, undefined, now);
    expect([r.desde, r.hasta, r.days]).toEqual(["2026-10-01", "2026-10-30", 30]);
    expect(r.from.toISOString()).toBe("2026-10-01T05:00:00.000Z");
    expect(r.to.toISOString()).toBe("2026-10-31T05:00:00.000Z");
  });
  it("invierte las fechas al revés, no pasa de hoy ni de un año e ignora fechas que no existen", () => {
    expect(reportRange("2026-10-20", "2026-10-05", now)).toMatchObject({ desde: "2026-10-05", hasta: "2026-10-20", days: 16 });
    expect(reportRange("2026-10-20", "2027-01-01", now)).toMatchObject({ hasta: "2026-10-30" });
    expect(reportRange("2020-01-01", "2026-10-30", now)).toMatchObject({ desde: "2025-10-30", days: 366 });
    expect(reportRange("2026-02-30", "x", now)).toMatchObject({ desde: "2026-10-01", hasta: "2026-10-30" });
  });
});

it("rangePresets: el mes pasado cruza bien el cambio de año", () => {
  expect(rangePresets(new Date("2026-01-15T15:00:00Z")).at(-1)).toMatchObject({ desde: "2025-12-01", hasta: "2025-12-31" });
});

describe("bucketKeys", () => {
  it("por día hasta dos meses, por mes si es más largo", () => {
    expect(bucketKeys(reportRange("2026-10-29", "2026-10-30", now))).toEqual(["2026-10-29", "2026-10-30"]);
    const year = reportRange("2025-11-15", "2026-10-30", now);
    expect(bucketUnit(year)).toBe("month");
    expect(bucketKeys(year)).toHaveLength(12);
    expect(bucketKeys(year).slice(0, 3)).toEqual(["2025-11", "2025-12", "2026-01"]);
  });
});

it("igvSplit: por línea, como la API (3 × S/ 33.33 + S/ 0.01 = S/ 100)", () => {
  expect(igvSplit([9900])).toEqual({ baseCents: 8390, igvCents: 1510 });
  expect(igvSplit([3333, 3333, 3334])).toEqual({ baseCents: 8475, igvCents: 1525 });
});

it("formatLimaDate", () => {
  expect(formatLimaDate(now)).toBe("30/10/2026");
});

it("toCsv: comillas, saltos de línea y fórmulas", () => {
  expect(toCsv([["Fecha", "Cliente", "Total"], ["30/10/2026", 'Ana "La" Torres, SAC', "-12.50"], ["", "=HYPERLINK(1)", null]])).toBe(
    'Fecha,Cliente,Total\r\n30/10/2026,"Ana ""La"" Torres, SAC",-12.50\r\n,\'=HYPERLINK(1),',
  );
});
