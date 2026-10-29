"use client";

import { useActionState } from "react";
import { FormAlert, SubmitButton } from "@/components/admin/form-controls";
import { Field, inputClass } from "@/components/ui/form";
import { idle } from "../../_lib/action-state";
import { openCashAction } from "./actions";

/** Abrir la caja de la tienda con el efectivo que hay para dar vuelto. */
export function OpenCashForm({ warehouseId, warehouseName }: { warehouseId: string; warehouseName: string }) {
  const [state, action] = useActionState(openCashAction.bind(null, warehouseId), idle);
  return (
    <form action={action} className="max-w-sm space-y-4 rounded-2xl border border-line p-5">
      <div>
        <h2 className="font-semibold">Abrir caja en {warehouseName}</h2>
        <p className="mt-1 text-sm text-muted">Cuenta el efectivo que hay para dar vuelto. Al cerrar, se compara con lo que debería haber.</p>
      </div>
      <Field label="Monto inicial S/">
        {(a11y) => <input {...a11y} name="opening" inputMode="decimal" placeholder="0" autoFocus className={inputClass} />}
      </Field>
      <SubmitButton className="w-full">Abrir caja</SubmitButton>
      <FormAlert state={state} />
    </form>
  );
}
