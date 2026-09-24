/**
 * Días hábiles en Perú (lunes a viernes sin feriados nacionales), para el plazo de 15 días hábiles
 * que da la ley para responder un reclamo (Ley 31435). Las fechas se cuentan en hora de Lima.
 */

const LIMA_OFFSET_MS = -5 * 60 * 60 * 1000;

/** Feriados de fecha fija (MM-DD). */
const FIXED_HOLIDAYS = new Set([
  "01-01", // Año Nuevo
  "05-01", // Día del Trabajo
  "06-07", // Batalla de Arica y Día de la Bandera
  "06-29", // San Pedro y San Pablo
  "07-23", // Día de la Fuerza Aérea
  "07-28", // Fiestas Patrias
  "07-29", // Fiestas Patrias
  "08-06", // Batalla de Junín
  "08-30", // Santa Rosa de Lima
  "10-08", // Combate de Angamos
  "11-01", // Todos los Santos
  "12-08", // Inmaculada Concepción
  "12-09", // Batalla de Ayacucho
  "12-25", // Navidad
]);

/** Domingo de Pascua (algoritmo gregoriano anónimo), en UTC. */
export function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

const key = (d: Date) => d.toISOString().slice(5, 10);

function isHoliday(day: Date): boolean {
  if (FIXED_HOLIDAYS.has(key(day))) return true;
  // Jueves y Viernes Santo.
  const easter = easterSunday(day.getUTCFullYear()).getTime();
  const diffDays = Math.round((easter - day.getTime()) / 86_400_000);
  return diffDays === 3 || diffDays === 2;
}

/** Fecha (00:00 UTC) del día calendario de Lima en que cae `instant`. */
export function limaDay(instant: Date): Date {
  const shifted = new Date(instant.getTime() + LIMA_OFFSET_MS);
  return new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()));
}

export function isBusinessDay(day: Date): boolean {
  const weekday = day.getUTCDay();
  return weekday !== 0 && weekday !== 6 && !isHoliday(day);
}

/** El día hábil número `count` contado desde el día siguiente a `from` (fecha de Lima, 00:00 UTC). */
export function addBusinessDays(from: Date, count: number): Date {
  const day = limaDay(from);
  let added = 0;
  while (added < count) {
    day.setUTCDate(day.getUTCDate() + 1);
    if (isBusinessDay(day)) added++;
  }
  return day;
}

/** Días hábiles que faltan hasta `deadline` (un día de `addBusinessDays`). 0 = vence hoy; negativo = vencido. */
export function businessDaysLeft(deadline: Date, now: Date): number {
  const today = limaDay(now);
  const end = new Date(Date.UTC(deadline.getUTCFullYear(), deadline.getUTCMonth(), deadline.getUTCDate()));
  if (today.getTime() === end.getTime()) return 0;
  const step = today < end ? 1 : -1;
  let count = 0;
  const day = new Date(today);
  while (day.getTime() !== end.getTime()) {
    day.setUTCDate(day.getUTCDate() + step);
    if (isBusinessDay(day)) count += step;
  }
  return count;
}

export const COMPLAINT_RESPONSE_DAYS = 15;
