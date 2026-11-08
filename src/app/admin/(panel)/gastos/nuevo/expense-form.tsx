"use client";

import { useActionState, useState } from "react";
import { FieldError, FormAlert, SubmitButton, Toggle } from "@/components/admin/form-controls";
import { Field, inputClass, selectClass, SelectWrap } from "@/components/ui/form";
import { idle } from "@/lib/action-state";
import { cn } from "@/lib/cn";
import { EXPENSE_CATEGORIES, EXPENSE_DOCUMENTS } from "@/lib/expenses";
import { PAYMENT_LABEL, PAYMENT_METHODS, type PaymentMethod } from "@/lib/pos";
import { createExpenseAction } from "../actions";

type Props = {
  warehouses: { id: string; name: string }[];
  /** Tiendas donde quien anota tiene su caja abierta (el gasto en efectivo puede salir de ahí). */
  openCashWarehouses: string[];
  today: string;
};

/** Nuevo gasto: de la caja (efectivo de hoy) o de otra forma (Yape, transferencia, o efectivo que no estaba en caja). */
export function ExpenseForm({ warehouses, openCashWarehouses, today }: Props) {
  const [state, action] = useActionState(createExpenseAction, idle);
  const v = state.values ?? {};
  const [warehouseId, setWarehouseId] = useState(v.warehouseId ?? openCashWarehouses[0] ?? warehouses[0]?.id ?? "");
  const [method, setMethod] = useState<PaymentMethod>((v.paymentMethod as PaymentMethod) ?? "efectivo");
  const cashOpen = openCashWarehouses.includes(warehouseId);
  const [fromCash, setFromCash] = useState(v.fromCash ? v.fromCash === "on" : cashOpen);
  const fromMyCash = fromCash && cashOpen && method === "efectivo";

  return (
    <form action={action} className="max-w-3xl space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Qué se pagó" error={state.fieldErrors?.description}>
          {(a11y) => <input {...a11y} name="description" defaultValue={v.description} required placeholder="Ej. Estampado, Adelanto Héctor, Bolsas" className={inputClass} />}
        </Field>
        <Field label="Monto S/" error={state.fieldErrors?.amount}>
          {(a11y) => <input {...a11y} name="amount" defaultValue={v.amount} required inputMode="decimal" className={cn(inputClass, "tabular-nums")} />}
        </Field>
        <Field label="Motivo">
          {(a11y) => (
            <SelectWrap>
              <select {...a11y} name="category" defaultValue={v.category ?? "varios"} className={selectClass}>
                {Object.entries(EXPENSE_CATEGORIES).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </SelectWrap>
          )}
        </Field>
        <Field label="Cómo se pagó">
          {(a11y) => (
            <SelectWrap>
              <select {...a11y} name="paymentMethod" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)} className={selectClass}>
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {PAYMENT_LABEL[m]}
                  </option>
                ))}
              </select>
            </SelectWrap>
          )}
        </Field>
        {warehouses.length > 1 ? (
          <Field label="Tienda">
            {(a11y) => (
              <SelectWrap>
                <select {...a11y} name="warehouseId" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} className={selectClass}>
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </SelectWrap>
            )}
          </Field>
        ) : (
          <input type="hidden" name="warehouseId" value={warehouseId} />
        )}
        {fromMyCash ? null : (
          <Field label="Fecha" error={state.fieldErrors?.issuedOn}>
            {(a11y) => <input {...a11y} type="date" name="issuedOn" defaultValue={v.issuedOn ?? today} max={today} className={inputClass} />}
          </Field>
        )}
      </div>

      {method === "efectivo" ? (
        cashOpen ? (
          <Toggle name="fromCash" checked={fromCash} onChange={setFromCash} label="Sale de mi caja" hint="Se descuenta del efectivo de tu caja abierta y va en su reporte de cierre. Es de hoy." />
        ) : (
          <p className="text-sm text-muted">No tienes una caja abierta en esta tienda: el gasto queda en el listado sin tocar ninguna caja.</p>
        )
      ) : null}

      <fieldset className="space-y-3 rounded-2xl border border-line p-4">
        <legend className="px-1 text-sm font-medium">A quién y comprobante (opcional)</legend>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Proveedor o persona">
            {(a11y) => <input {...a11y} name="supplierName" defaultValue={v.supplierName} placeholder="Nombre o razón social" className={inputClass} />}
          </Field>
          <Field label="DNI o RUC">
            {(a11y) => <input {...a11y} name="supplierDocument" defaultValue={v.supplierDocument} inputMode="numeric" className={inputClass} />}
          </Field>
          <Field label="Comprobante">
            {(a11y) => (
              <SelectWrap>
                <select {...a11y} name="documentType" defaultValue={v.documentType ?? "ninguno"} className={selectClass}>
                  {Object.entries(EXPENSE_DOCUMENTS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </SelectWrap>
            )}
          </Field>
          <Field label="N° de comprobante">
            {(a11y) => <input {...a11y} name="documentNumber" defaultValue={v.documentNumber} placeholder="Ej. F001-123" className={inputClass} />}
          </Field>
        </div>
      </fieldset>
      <FieldError state={state} name="warehouseId" />
      <FormAlert state={state} />
      <SubmitButton pendingLabel="Guardando…">Guardar gasto</SubmitButton>
    </form>
  );
}
