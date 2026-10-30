import { axisMax } from "@/components/admin/visits";
import { cn } from "@/lib/cn";
import { formatPrice } from "@/lib/money";
import { bucketLabel } from "@/lib/reports";
import type { SalesReport } from "@/server/services/reports";

/**
 * Colores de las dos series (azul y naranja, pasos para fondo oscuro). Validados contra el fondo de las tarjetas
 * (#0d0d0d): se distinguen con daltonismo (ΔE 26.8) y contrastan más de 3:1. El texto nunca va de estos colores.
 */
const SERIES = [
  { key: "storeCents", label: "Tienda", color: "bg-[#3987e5]" },
  { key: "webCents", label: "Web", color: "bg-[#d95926]" },
] as const;

const soles = (cents: number) => cents / 100;
/** Eje: "S/ 500", "S/ 1.5K". */
const axisAmount = (value: number) => (value >= 1000 ? `S/ ${value / 1000}K` : `S/ ${value}`);

/**
 * Columnas apiladas por día (o por mes): tienda abajo y web arriba, separadas por 2 px de fondo. Sin JavaScript: el
 * detalle sale al pasar el mouse o al tocar la columna (foco), y la tabla queda abajo para leerlo todo.
 */
export function SalesChart({ report }: { report: SalesReport }) {
  const { buckets, unit } = report;
  const totals = buckets.map((b) => b.storeCents + b.webCents);
  const max = Math.max(0, ...totals);
  const top = axisMax(soles(max)) * 100;
  const ticks = top % 200 === 0 ? [top / 2, top] : [top];
  // Etiquetas del eje x: todas si son pocas; si no, cada semana (o cada mes).
  const every = buckets.length <= 8 ? 1 : unit === "day" ? 7 : 2;
  const peak = max > 0 ? totals.indexOf(max) : -1;

  return (
    <figure>
      <figcaption className="mb-4 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted">
        {SERIES.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-2">
            <span className={cn("size-2.5 rounded-sm", s.color)} aria-hidden />
            {s.label}
          </span>
        ))}
      </figcaption>
      <div className="relative h-52 pt-5 pl-12">
        <div className="absolute inset-x-0 top-5 bottom-0 left-12 border-b border-line" aria-hidden>
          {ticks.map((t) => (
            <div key={t} className="absolute inset-x-0 border-t border-line" style={{ bottom: `${(t / top) * 100}%` }}>
              <span className="absolute -top-2 -left-12 w-10 text-right text-[11px] leading-none text-subtle tabular-nums">{axisAmount(soles(t))}</span>
            </div>
          ))}
          <span className="absolute bottom-0 -left-12 w-10 text-right text-[11px] leading-none text-subtle">0</span>
        </div>
        <ol className="relative flex h-full items-end gap-0.5">
          {buckets.map((b, i) => {
            const total = totals[i];
            const label = bucketLabel(b.key);
            const filled = SERIES.filter((s) => b[s.key] > 0);
            return (
              <li
                key={b.key}
                tabIndex={0}
                aria-label={`${label}: tienda ${formatPrice(b.storeCents)}, web ${formatPrice(b.webCents)}`}
                className="group relative flex h-full min-w-0 flex-1 items-end justify-center rounded-t outline-none hover:bg-white/5 focus-visible:bg-white/5"
              >
                {total > 0 ? (
                  <span className="flex w-full max-w-6 flex-col-reverse gap-0.5" style={{ height: `${(total / top) * 100}%` }}>
                    {filled.map((s, j) => (
                      <span key={s.key} className={cn("min-h-0.5", s.color, j === filled.length - 1 && "rounded-t")} style={{ flexGrow: b[s.key] }} />
                    ))}
                  </span>
                ) : null}
                {i === peak ? (
                  // El día más alto lleva su total arriba; los demás, en el detalle y en la tabla.
                  <span
                    className={cn(
                      "absolute text-[11px] whitespace-nowrap text-muted tabular-nums",
                      i < buckets.length / 3 ? "left-0" : i > (buckets.length * 2) / 3 ? "right-0" : "left-1/2 -translate-x-1/2",
                    )}
                    style={{ bottom: `calc(${(total / top) * 100}% + 4px)` }}
                    aria-hidden
                  >
                    {formatPrice(total)}
                  </span>
                ) : null}
                <span
                  className={cn(
                    "pointer-events-none absolute top-0 z-10 hidden rounded-lg border border-line bg-raised px-2.5 py-1.5 text-xs whitespace-nowrap shadow-lg group-hover:block group-focus-visible:block",
                    i < buckets.length / 3 ? "left-0" : i > (buckets.length * 2) / 3 ? "right-0" : "left-1/2 -translate-x-1/2",
                  )}
                  aria-hidden
                >
                  <span className="block text-muted first-letter:uppercase">{label}</span>
                  {SERIES.map((s) => (
                    <span key={s.key} className="flex items-center gap-2">
                      <span className={cn("size-2 rounded-sm", s.color)} />
                      {s.label}
                      <span className="ml-auto pl-3 tabular-nums">{formatPrice(b[s.key])}</span>
                    </span>
                  ))}
                  <span className="mt-1 flex justify-between gap-3 border-t border-line pt-1 font-semibold">
                    Total <span className="tabular-nums">{formatPrice(total)}</span>
                  </span>
                </span>
              </li>
            );
          })}
        </ol>
      </div>
      <ol className="mt-2 flex gap-0.5 pl-12 text-[11px] text-subtle" aria-hidden>
        {buckets.map((b, i) => (
          <li key={b.key} className="relative h-4 min-w-0 flex-1">
            {i % every === 0 ? (
              <span className={cn("absolute left-1/2 -translate-x-1/2 whitespace-nowrap", every === 1 && buckets.length > 4 && i % 2 === 1 && "max-sm:hidden")}>
                {bucketLabel(b.key, true)}
              </span>
            ) : null}
          </li>
        ))}
      </ol>
      <details className="mt-4 text-sm">
        <summary className="inline-flex min-h-10 cursor-pointer items-center text-muted hover:text-white">Ver como tabla</summary>
        <table className="mt-2 w-full max-w-lg text-left">
          <thead className="text-xs text-subtle">
            <tr>
              <th className="py-1 font-normal">{unit === "day" ? "Día" : "Mes"}</th>
              <th className="py-1 text-right font-normal">Tienda</th>
              <th className="py-1 text-right font-normal">Web</th>
              <th className="py-1 text-right font-normal">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {buckets.map((b, i) => (
              <tr key={b.key}>
                <td className="py-1.5 first-letter:uppercase">{bucketLabel(b.key)}</td>
                <td className="py-1.5 text-right tabular-nums">{formatPrice(b.storeCents)}</td>
                <td className="py-1.5 text-right tabular-nums">{formatPrice(b.webCents)}</td>
                <td className="py-1.5 text-right font-semibold tabular-nums">{formatPrice(totals[i])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
