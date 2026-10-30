/** Fechas y formato de los reportes del panel (días de Lima, sin horario de verano: UTC-5). */

const DAY = 24 * 60 * 60 * 1000;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
/** Un año: más que eso no se lee en un gráfico y la consulta crece sin sentido. */
const MAX_DAYS = 366;

const limaDay = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" });
export const todayInLima = (now = new Date()) => limaDay.format(now);

/** "2026-10-31" + n días. */
export const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY);
const isDay = (v: unknown): v is string => typeof v === "string" && DATE.test(v) && addDays(v, 0) === v;

/** Días de Lima `desde`–`hasta` (los dos incluidos) y los instantes [from, to) para filtrar en la BD. */
export type ReportRange = { desde: string; hasta: string; from: Date; to: Date; days: number };

/** El rango de la URL; sin fechas (o con fechas que no existen), este mes. Nunca pasa de hoy ni de un año. */
export function reportRange(desde: unknown, hasta: unknown, now = new Date()): ReportRange {
  const today = todayInLima(now);
  let end = isDay(hasta) && hasta < today ? hasta : today;
  let start = isDay(desde) ? desde : `${today.slice(0, 8)}01`;
  if (start > end) [start, end] = [end, start];
  if (daysBetween(start, end) >= MAX_DAYS) start = addDays(end, -(MAX_DAYS - 1));
  return { desde: start, hasta: end, from: new Date(`${start}T00:00:00-05:00`), to: new Date(`${addDays(end, 1)}T00:00:00-05:00`), days: daysBetween(start, end) + 1 };
}

export function rangePresets(now = new Date()) {
  const today = todayInLima(now);
  const monthStart = `${today.slice(0, 8)}01`;
  const lastMonthEnd = addDays(monthStart, -1);
  return [
    { label: "Hoy", desde: today, hasta: today },
    { label: "7 días", desde: addDays(today, -6), hasta: today },
    { label: "Este mes", desde: monthStart, hasta: today },
    { label: "Mes pasado", desde: `${lastMonthEnd.slice(0, 8)}01`, hasta: lastMonthEnd },
  ];
}

/** Hasta dos meses, una columna por día; más largo, una por mes. */
export const bucketUnit = (range: Pick<ReportRange, "days">): "day" | "month" => (range.days <= 62 ? "day" : "month");

/** Todas las columnas del rango, también las que no tuvieron ventas: "2026-10-01"… o "2026-10"… */
export function bucketKeys(range: ReportRange): string[] {
  const keys: string[] = [];
  if (bucketUnit(range) === "day") {
    for (let d = range.desde; d <= range.hasta; d = addDays(d, 1)) keys.push(d);
    return keys;
  }
  let [year, month] = range.desde.split("-").map(Number);
  const last = range.hasta.slice(0, 7);
  for (;;) {
    const key = `${year}-${String(month).padStart(2, "0")}`;
    keys.push(key);
    if (key >= last) return keys;
    month = month === 12 ? 1 : month + 1;
    if (month === 1) year++;
  }
}

const dayLabel = new Intl.DateTimeFormat("es-PE", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" });
const shortDayLabel = new Intl.DateTimeFormat("es-PE", { timeZone: "UTC", day: "numeric", month: "short" });
const monthLabel = new Intl.DateTimeFormat("es-PE", { timeZone: "UTC", month: "short", year: "numeric" });

/** "vie, 30 oct" / "30 oct" para el eje; "oct 2026" por mes. */
export function bucketLabel(key: string, short = false) {
  if (key.length === 7) return monthLabel.format(new Date(`${key}-15T12:00:00Z`));
  return (short ? shortDayLabel : dayLabel).format(new Date(`${key}T12:00:00Z`));
}

/** "30/10/2026": como lo lee el Excel en español. */
export const formatLimaDate = (d: Date) => {
  const [y, m, day] = limaDay.format(d).split("-");
  return `${day}/${m}/${y}`;
};

const NUMBER = /^-?\d+(\.\d+)?$/;

/**
 * CSV para Excel. Un texto que empiece con =, +, - o @ se lee como fórmula: va con un apóstrofo delante (los nombres
 * de clientes de la web los escribe cualquiera). Los montos ("-12.50") pasan tal cual.
 */
export function toCsv(rows: (string | number | null)[][]): string {
  const cell = (value: string | number | null) => {
    if (value === null) return "";
    let text = String(value);
    if (!NUMBER.test(text) && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return rows.map((row) => row.map(cell).join(",")).join("\r\n");
}
