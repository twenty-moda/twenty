"use client";

import { useActionState, useState } from "react";
import { FormAlert, SubmitButton } from "@/components/admin/form-controls";
import { Field, inputCompactClass, selectClass, SelectWrap } from "@/components/ui/form";
import { cn } from "@/lib/cn";
import { formatPrice } from "@/lib/money";
import { idle } from "../../_lib/action-state";
import { addCashMovementAction, closeCashAction } from "./actions";

/** Efectivo que entra o sale sin ser venta: sencillo, pago de movilidad, retiro para el banco. */
export function CashMovementForm({ sessionId }: { sessionId: string }) {
  const [state, action] = useActionState(addCashMovementAction.bind(null, sessionId), idle);
  return (
    <form action={action} className="space-y-3">
      <div className="flex flex-wrap gap-3">
        <Field label="Tipo" className="w-36">
          {(a11y) => (
            <SelectWrap>
              <select {...a11y} name="type" defaultValue="egreso" className={cn(selectClass, "h-11 text-sm")}>
                <option value="egreso">Egreso (sale)</option>
                <option value="ingreso">Ingreso (entra)</option>
              </select>
            </SelectWrap>
          )}
        </Field>
        <Field label="Monto S/" className="w-28">
          {(a11y) => <input {...a11y} name="amount" inputMode="decimal" className={cn(inputCompactClass, "tabular-nums")} />}
        </Field>
        <Field label="Motivo" className="min-w-48 flex-1">
          {(a11y) => <input {...a11y} name="note" placeholder="Ej. Pago de movilidad" className={inputCompactClass} />}
        </Field>
      </div>
      <SubmitButton variant="secondary">Registrar</SubmitButton>
      <FormAlert state={state} />
    </form>
  );
}

/** Arqueo: se cuenta el efectivo y se ve la diferencia antes de cerrar. */
export function CloseCashForm({ sessionId, number, expectedCashCents }: { sessionId: string; number: number; expectedCashCents: number }) {
  const [state, action] = useActionState(closeCashAction.bind(null, sessionId, number), idle);
  const [counted, setCounted] = useState("");
  const n = Number(counted.replace(",", "."));
  const countedCents = counted.trim() && Number.isFinite(n) ? Math.round(n * 100) : null;
  const diff = countedCents === null ? null : countedCents - expectedCashCents;
  return (
    <form action={action} className="space-y-3">
      <p className="text-sm text-muted">
        Debería haber <span className="font-semibold text-white">{formatPrice(expectedCashCents)}</span> en efectivo.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Efectivo contado S/" className="w-44">
          {(a11y) => <input {...a11y} name="counted" inputMode="decimal" value={counted} onChange={(e) => setCounted(e.target.value)} className={cn(inputCompactClass, "tabular-nums")} />}
        </Field>
        {diff !== null ? (
          <p className={cn("pb-3 text-sm font-semibold", diff === 0 ? "text-success" : "text-warning")}>
            {diff === 0 ? "Cuadra" : diff > 0 ? `Sobran ${formatPrice(diff)}` : `Faltan ${formatPrice(-diff)}`}
          </p>
        ) : null}
      </div>
      <Field label="Nota" optional>
        {(a11y) => <input {...a11y} name="note" placeholder="Ej. Se depositó S/ 500 en el BCP" className={inputCompactClass} />}
      </Field>
      <SubmitButton pendingLabel="Cerrando…">Cerrar caja</SubmitButton>
      <FormAlert state={state} />
    </form>
  );
}
