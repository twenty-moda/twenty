"use client";

import { useState } from "react";
import { Toggle } from "@/components/admin/form-controls";
import { cn } from "@/lib/cn";
import { formatPrice } from "@/lib/money";
import { REFUND_REASON_INFO, REFUND_REASONS, type RefundReason } from "@/lib/refunds";
import type { RefundableItem, RefundOptions } from "@/server/services/refunds";

/** Motivo de la devolución: cuatro botones grandes. Envía `refundReason`. `cancelling`: se devuelve al anular. */
export function ReasonPicker({ value, onChange, cancelling = false }: { value: RefundReason | null; onChange: (reason: RefundReason) => void; cancelling?: boolean }) {
  return (
    <fieldset className="min-w-0">
      <legend className="mb-1.5 text-sm font-medium">Motivo</legend>
      <div role="radiogroup" aria-label="Motivo" className="grid grid-cols-2 gap-2">
        {REFUND_REASONS.map((reason) => (
          <button
            key={reason}
            type="button"
            role="radio"
            aria-checked={value === reason}
            onClick={() => onChange(reason)}
            className={cn(
              "min-h-11 rounded-xl border px-3 py-2 text-sm font-semibold transition",
              value === reason ? "border-white bg-white text-black" : "border-line bg-raised text-muted hover:text-white",
            )}
          >
            {REFUND_REASON_INFO[reason].label}
          </button>
        ))}
      </div>
      {value ? (
        <p className="mt-1.5 text-xs text-muted">
          {cancelling && value === "agotado" ? "Marca qué prendas no hay: al anular no vuelven al stock." : REFUND_REASON_INFO[value].hint}
        </p>
      ) : null}
      <input type="hidden" name="refundReason" value={value ?? ""} />
    </fieldset>
  );
}

/**
 * Prendas agotadas: se marcan y se elige cuántas (si la línea tiene más de una). Envía `agotada:<id>` = unidades y,
 * si alguna todavía tiene stock en la tienda, el interruptor `clearStock`.
 */
export function SoldOutPicker({
  items,
  selected,
  onChange,
  title = "¿Qué prendas se agotaron?",
}: {
  items: RefundableItem[];
  selected: Record<string, number>;
  onChange: (selected: Record<string, number>) => void;
  title?: string;
}) {
  const set = (id: string, qty: number) => onChange({ ...selected, [id]: qty });
  const withStock = items.filter((i) => (selected[i.id] ?? 0) > 0 && (i.stock ?? 0) > 0);
  return (
    <fieldset className="min-w-0 space-y-3">
      <legend className="mb-1.5 text-sm font-medium">{title}</legend>
      <ul className="divide-y divide-line rounded-xl border border-line">
        {items.map((item) => {
          const qty = selected[item.id] ?? 0;
          return (
            <li key={item.id} className="flex items-center gap-2 pr-3">
              <label className="flex min-h-14 min-w-0 flex-1 cursor-pointer items-center gap-3 py-2 pl-3">
                <input type="checkbox" checked={qty > 0} onChange={(e) => set(item.id, e.target.checked ? 1 : 0)} className="size-5 shrink-0 accent-white" />
                <span className="min-w-0 text-sm">
                  <span className="block font-medium">{item.name}</span>
                  <span className="block text-xs break-words text-muted">
                    {item.detail}
                    {item.stock !== null ? ` · En la tienda: ${item.stock}` : ""}
                  </span>
                </span>
              </label>
              {qty > 0 && item.available > 1 ? (
                <select
                  aria-label={`Unidades agotadas de ${item.name}`}
                  value={qty}
                  onChange={(e) => set(item.id, Number(e.target.value))}
                  className="h-10 shrink-0 rounded-lg border border-line bg-raised px-2 text-sm"
                >
                  {Array.from({ length: item.available }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>
                      {n} de {item.available}
                    </option>
                  ))}
                </select>
              ) : null}
              {qty > 0 ? <input type="hidden" name={`agotada:${item.id}`} value={qty} /> : null}
            </li>
          );
        })}
      </ul>
      {withStock.length ? (
        <Toggle
          name="clearStock"
          defaultChecked
          label="Dejar sin stock en la tienda"
          hint={`Así nadie más las compra. Hoy figuran con stock: ${withStock.map((i) => `${i.name} (${i.stock})`).join(", ")}.`}
        />
      ) : null}
    </fieldset>
  );
}

/**
 * Al anular un pedido pagado: devolver también todo lo pagado (Culqi) o registrar que ya se devolvió (pago por
 * fuera). Envía `refund`, `refundMethod`, `refundReason` y las prendas agotadas (que no vuelven al stock).
 */
export function CancelRefundFields({ options }: { options: Pick<RefundOptions, "availableCents" | "culqi" | "items"> }) {
  const culqi = options.culqi;
  const amount = formatPrice(culqi ? culqi.maxCents : options.availableCents);
  const [on, setOn] = useState(!!culqi);
  const [reason, setReason] = useState<RefundReason | null>(null);
  const [selected, setSelected] = useState<Record<string, number>>({});
  return (
    <div className="space-y-4 rounded-xl border border-warning/40 p-4">
      <p className="text-sm">
        Este pedido tiene <strong>{formatPrice(options.availableCents)}</strong> pagados{culqi ? " por Culqi" : ""} sin devolver.
      </p>
      <Toggle
        name="refund"
        checked={on}
        onChange={setOn}
        label={culqi ? `Devolver los ${amount} por Culqi` : `Ya le devolví los ${amount}`}
        hint={
          culqi
            ? "Vuelven a la tarjeta o el Yape con que pagó, y el email de anulación se lo dice."
            : "Anular no mueve dinero: devuélveselo por Yape, Plin o transferencia y márcalo para que quede registrado."
        }
      />
      {on ? (
        <>
          <input type="hidden" name="refundMethod" value={culqi ? "culqi" : "manual"} />
          <ReasonPicker value={reason} onChange={setReason} cancelling />
          {reason === "agotado" ? (
            <SoldOutPicker items={options.items} selected={selected} onChange={setSelected} />
          ) : null}
        </>
      ) : null}
    </div>
  );
}
