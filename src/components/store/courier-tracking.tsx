import { Check, Package } from "lucide-react";
import { cn } from "@/lib/cn";
import { COURIER_NAME, GUIDE_FIELDS, guideCodeText, type Courier, type CourierGuide, type CourierTracking } from "@/lib/couriers";

/** "2025-12-23 19:40:00" (hora de Lima, como la dan Shalom y Olva) → "23 dic., 7:40 p. m."; "2025-12-23" → "23 dic.". */
const withTime = new Intl.DateTimeFormat("es-PE", { timeZone: "UTC", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
const dayOnly = new Intl.DateTimeFormat("es-PE", { timeZone: "UTC", day: "numeric", month: "short" });
function stepDate(value: string) {
  const onlyDay = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = new Date(onlyDay ? `${value}T12:00:00Z` : `${value.replace(" ", "T")}Z`);
  return Number.isNaN(date.getTime()) ? value : (onlyDay ? dayOnly : withTime).format(date);
}

/**
 * Seguimiento de la guía de Shalom u Olva (página del pedido, panel y /tracking). Sin datos personales: solo los
 * pasos del envío. En /tracking va sin `guide` (con la de Shalom se retira el paquete) ni lugares.
 */
export function CourierTrackingCard({
  courier,
  guide,
  tracking,
  className,
}: {
  courier: Courier;
  guide?: CourierGuide;
  tracking: CourierTracking | null;
  className?: string;
}) {
  const steps = tracking?.steps ?? [];
  const name = COURIER_NAME[courier];
  const fields = GUIDE_FIELDS[courier];
  const headingId = `seguimiento-${courier}`;
  return (
    <section aria-labelledby={headingId} className={cn("rounded-2xl border border-line p-5", className)}>
      <h2 id={headingId} className="flex items-center gap-2 font-semibold">
        <Package className="size-5" aria-hidden /> Seguimiento {name}
      </h2>
      {guide ? (
        <p className="mt-1 text-sm text-muted">
          {fields.number} <strong className="text-white tabular-nums">{guide.number}</strong> · {fields.code}{" "}
          <strong className="text-white">{guideCodeText(courier, guide.code)}</strong>
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
                  <span className="block text-xs text-subtle">
                    {stepDate(step.date)}
                    {step.place ? ` · ${step.place}` : ""}
                  </span>
                </li>
              );
            })}
          </ol>
          {tracking?.destination || tracking?.eta ? (
            <p className="mt-4 text-xs text-muted">{[tracking.destination ? `Destino: ${tracking.destination}` : null, tracking.eta].filter(Boolean).join(" · ")}</p>
          ) : null}
        </>
      ) : (
        <p className="mt-3 text-sm text-muted">Aún no hay movimientos del envío en {name}. Vuelve a mirar en unas horas.</p>
      )}
    </section>
  );
}
