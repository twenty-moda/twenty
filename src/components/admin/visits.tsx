import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

const number = new Intl.NumberFormat("es-PE");
export const formatCount = (n: number) => number.format(n);

const dayFormat = new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", weekday: "short", day: "numeric", month: "short" });
const shortDayFormat = new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", day: "numeric", month: "short" });
const hourFormat = new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/** Tope del eje: un número redondo (1, 2, 5, 10, 15, 20, 50…) igual o mayor que el máximo. */
function axisMax(max: number) {
  if (max <= 2) return 2;
  const power = 10 ** Math.floor(Math.log10(max));
  const step = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((m) => Number.isInteger(m * power) && m * power >= max) ?? 10;
  return step * power;
}

/**
 * Columnas de páginas vistas por hora o por día (una sola serie: el título dice qué es, sin leyenda). Sin JavaScript: el
 * dato de cada columna sale al pasar el mouse o al tocarla (foco), y la tabla queda abajo para leerlo todo.
 */
export function VisitsChart({ series, unit }: { series: { at: number; pageviews: number }[]; unit: "hour" | "day" }) {
  const top = axisMax(Math.max(0, ...series.map((s) => s.pageviews)));
  const ticks = top % 2 === 0 ? [top / 2, top] : [top];
  const label = (at: number) => (unit === "hour" ? hourFormat.format(at) : dayFormat.format(at));
  // Etiquetas del eje x: cada 6 horas, o cada día si son 7 y cada semana si son 30.
  const every = unit === "hour" ? 6 : series.length <= 7 ? 1 : 7;
  const axisLabel = (at: number) => (unit === "hour" ? hourFormat.format(at) : shortDayFormat.format(at));
  const amount = (n: number) => `${formatCount(n)} ${n === 1 ? "página vista" : "páginas vistas"}`;

  return (
    <figure>
      <div className="relative h-48 pl-9">
        <div className="absolute inset-y-0 right-0 left-9 border-b border-line" aria-hidden>
          {ticks.map((t) => (
            <div key={t} className="absolute inset-x-0 border-t border-line" style={{ bottom: `${(t / top) * 100}%` }}>
              <span className="absolute -top-2 -left-9 w-7 text-right text-[11px] leading-none text-subtle tabular-nums">{formatCount(t)}</span>
            </div>
          ))}
          <span className="absolute bottom-0 -left-9 w-7 text-right text-[11px] leading-none text-subtle">0</span>
        </div>
        <ol className="relative flex h-full items-end gap-0.5">
          {series.map((s, i) => (
            <li
              key={s.at}
              tabIndex={0}
              aria-label={`${label(s.at)}: ${amount(s.pageviews)}`}
              className="group relative flex h-full min-w-0 flex-1 items-end justify-center outline-none"
            >
              <span
                className="w-full max-w-6 rounded-t bg-white/70 transition-colors group-hover:bg-white group-focus-visible:bg-white"
                style={{ height: `${(s.pageviews / top) * 100}%`, minHeight: s.pageviews > 0 ? 2 : 0 }}
              />
              <span
                className={cn(
                  "pointer-events-none absolute top-0 z-10 hidden rounded-lg border border-line bg-raised px-2.5 py-1.5 text-xs whitespace-nowrap shadow-lg group-hover:block group-focus-visible:block",
                  i < series.length / 3 ? "left-0" : i > (series.length * 2) / 3 ? "right-0" : "left-1/2 -translate-x-1/2",
                )}
                aria-hidden
              >
                <span className="block text-muted first-letter:uppercase">{label(s.at)}</span>
                <span className="block font-semibold">{amount(s.pageviews)}</span>
              </span>
            </li>
          ))}
        </ol>
      </div>
      <ol className="mt-2 flex gap-0.5 pl-9 text-[11px] text-subtle" aria-hidden>
        {series.map((s, i) => (
          <li key={s.at} className="relative h-4 min-w-0 flex-1">
            {i % every === 0 ? (
              // Con 7 días, en el teléfono no entran todas las fechas: va una sí y una no.
              <span className={cn("absolute left-1/2 -translate-x-1/2 whitespace-nowrap", every === 1 && i % 2 === 1 && "max-sm:hidden")}>{axisLabel(s.at)}</span>
            ) : null}
          </li>
        ))}
      </ol>
      <details className="mt-4 text-sm">
        <summary className="inline-flex min-h-10 cursor-pointer items-center text-muted hover:text-white">Ver como tabla</summary>
        <table className="mt-2 w-full max-w-sm text-left">
          <thead className="text-xs text-subtle">
            <tr>
              <th className="py-1 font-normal">{unit === "hour" ? "Hora" : "Día"}</th>
              <th className="py-1 text-right font-normal">Páginas vistas</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {series.map((s) => (
              <tr key={s.at}>
                <td className="py-1.5 first-letter:uppercase">{label(s.at)}</td>
                <td className="py-1.5 text-right tabular-nums">{formatCount(s.pageviews)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

/** Lista con barra proporcional al primero (todas de un mismo tono: es cantidad, no categorías). */
export function BarList({ rows, empty = "Sin datos en estas fechas." }: { rows: { key: string; label: ReactNode; value: number }[]; empty?: string }) {
  if (!rows.length) return <p className="text-sm text-muted">{empty}</p>;
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="-my-1.5">
      {rows.map((r) => (
        <li key={r.key} className="py-1.5">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="min-w-0 flex-1">{r.label}</span>
            <span className="shrink-0 text-muted tabular-nums">{formatCount(r.value)}</span>
          </div>
          <div className="mt-1.5 h-1.5 rounded-full bg-raised">
            <div className="h-full rounded-full bg-white/70" style={{ width: `${(r.value / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
