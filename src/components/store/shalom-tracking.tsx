import { Check, Package } from "lucide-react";
import { cn } from "@/lib/cn";
import type { ShalomTracking } from "@/lib/shalom";

/** "2025-12-23 19:40:00" (hora de Lima, como la da Shalom) → "23 dic., 7:40 p. m.". */
const format = new Intl.DateTimeFormat("es-PE", { timeZone: "UTC", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
function shalomDate(value: string) {
  const date = new Date(`${value.replace(" ", "T")}Z`);
  return Number.isNaN(date.getTime()) ? value : format.format(date);
}

/**
 * Seguimiento de la guía de Shalom (página del pedido, panel y /tracking). Sin datos personales: solo los pasos del
 * envío. En /tracking va sin `guide` (N° de orden y código), porque con ellos se retira el paquete.
 */
export function ShalomTrackingCard({ guide, tracking, className }: { guide?: { number: string; code: string }; tracking: ShalomTracking | null; className?: string }) {
  const steps = tracking?.steps ?? [];
  return (
    <section aria-labelledby="seguimiento-shalom" className={cn("rounded-2xl border border-line p-5", className)}>
      <h2 id="seguimiento-shalom" className="flex items-center gap-2 font-semibold">
        <Package className="size-5" aria-hidden /> Seguimiento Shalom
      </h2>
      {guide ? (
        <p className="mt-1 text-sm text-muted">
          N° de orden <strong className="text-white tabular-nums">{guide.number}</strong> · Código <strong className="text-white">{guide.code}</strong>
        </p>
      ) : null}
      {steps.length ? (
        <>
          <ol className="mt-4 space-y-3 border-l border-line pl-4">
            {steps.map((step, i) => {
              const last = i === steps.length - 1;
              return (
                <li key={step.key} className="relative text-sm">
                  <span
                    className={cn("absolute top-0.5 left-[calc(-1rem-8.5px)] grid size-4 place-items-center rounded-full", last ? "bg-white text-black" : "bg-raised text-muted")}
                    aria-hidden
                  >
                    <Check className="size-3" />
                  </span>
                  <span className={last ? "font-semibold" : "text-muted"}>{step.label}</span>
                  <span className="block text-xs text-subtle">{shalomDate(step.date)}</span>
                </li>
              );
            })}
          </ol>
          {tracking?.destination || tracking?.eta ? (
            <p className="mt-4 text-xs text-muted">
              {tracking.destination ? `Destino: ${tracking.destination}` : ""}
              {tracking.destination && tracking.eta ? " · " : ""}
              {tracking.eta ? `Tiempo estimado: ${tracking.eta}` : ""}
            </p>
          ) : null}
        </>
      ) : (
        <p className="mt-3 text-sm text-muted">Aún no hay movimientos del envío en Shalom. Vuelve a mirar en unas horas.</p>
      )}
    </section>
  );
}
