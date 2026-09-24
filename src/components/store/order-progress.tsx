import { cn } from "@/lib/cn";
import { ORDER_PROGRESS, progressIndex, type OrderStatus } from "@/lib/order-status";

/** Los 5 pasos del pedido (página del pedido y rastreo). No se muestra si está anulado o rechazado. */
export function OrderProgress({ status, className }: { status: OrderStatus; className?: string }) {
  const step = progressIndex(status);
  if (step < 0) return null;
  return (
    <div className={className}>
      <ol className="grid grid-cols-5 gap-1" aria-label="Estado del pedido">
        {ORDER_PROGRESS.map((p, i) => (
          <li key={p.status} className="text-center" aria-current={i === step ? "step" : undefined}>
            <span className={cn("block h-1.5 rounded-full", i <= step ? "bg-white" : "bg-raised")} />
            {/* En teléfonos muy angostos las 5 etiquetas no entran: se muestra solo el paso actual, debajo. */}
            <span className={cn("mt-2 hidden text-[11px] leading-tight min-[360px]:block", i === step ? "font-semibold text-white" : "text-subtle")}>{p.label}</span>
          </li>
        ))}
      </ol>
      <p className="mt-2 text-center text-xs min-[360px]:hidden">
        <span className="text-subtle">
          Paso {step + 1} de {ORDER_PROGRESS.length}:{" "}
        </span>
        <span className="font-semibold">{ORDER_PROGRESS[step].label}</span>
      </p>
    </div>
  );
}
