"use client";

import { Minus, Plus } from "lucide-react";
import { useActionState, useRef, useState, useTransition } from "react";
import { FieldError, FormAlert, SubmitButton } from "@/components/admin/form-controls";
import { buttonClass } from "@/components/admin/ui";
import { Field, inputCompactClass, selectClass, SelectWrap } from "@/components/ui/form";
import { idle, type ActionState } from "@/lib/action-state";
import { cn } from "@/lib/cn";
import { EXPENSE_CATEGORIES, EXPENSE_DOCUMENTS, QUICK_EXPENSES, type ExpenseCategory } from "@/lib/expenses";
import { formatPrice } from "@/lib/money";
import { addCashExpenseAction, addCashMovementAction, closeCashAction, voidExpenseAction } from "./actions";

/** Los motivos de siempre: un toque llena el tipo y el motivo. Los gastos (movilidad, adelantos) van en «Gastos». */
const QUICK_MOVEMENTS = [
  { label: "Sencillo", type: "ingreso", note: "Sencillo para dar vuelto" },
  { label: "Depósito al banco", type: "egreso", note: "Depósito al banco" },
  { label: "Retiro de la dueña", type: "egreso", note: "Retiro de efectivo" },
] as const;

/**
 * Gasto pagado con el efectivo de la caja: movilidad, adelantos, bolsas… Sale del arqueo y del reporte de cierre, y
 * queda en Gastos. Proveedor y comprobante son opcionales.
 */
export function CashExpenseForm({ sessionId, warehouseId }: { sessionId: string; warehouseId: string }) {
  const [formKey, setFormKey] = useState(0);
  const [state, action] = useActionState(async (prev: ActionState, fd: FormData) => {
    const result = await addCashExpenseAction(sessionId, warehouseId, prev, fd);
    if (result.status === "success") setFormKey((k) => k + 1);
    return result;
  }, idle);
  return (
    <div className="space-y-3">
      <form key={formKey} action={action} className="space-y-3">
        <ExpenseFields state={state} />
        <SubmitButton variant="secondary" pendingLabel="Anotando…">
          Anotar gasto
        </SubmitButton>
      </form>
      <FormAlert state={state} />
    </div>
  );
}

function ExpenseFields({ state }: { state: ActionState }) {
  const [category, setCategory] = useState<ExpenseCategory>("varios");
  const [description, setDescription] = useState("");
  const [more, setMore] = useState(false);
  const amountRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <div className="flex flex-wrap gap-2">
        {QUICK_EXPENSES.map((q) => (
          <button
            key={q.label}
            type="button"
            onClick={() => {
              setCategory(q.category);
              setDescription(q.description);
              // "Adelanto de " pide el nombre; los demás, el monto.
              (q.description.endsWith(" ") ? descriptionRef : amountRef).current?.focus();
            }}
            className="h-9 rounded-full border border-line px-3.5 text-sm font-semibold hover:border-white"
          >
            {q.label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-3">
        <Field label="Qué se pagó" className="min-w-48 flex-1">
          {(a11y) => (
            <input {...a11y} ref={descriptionRef} name="description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ej. Adelanto Héctor" className={inputCompactClass} />
          )}
        </Field>
        <Field label="Monto S/" className="w-28">
          {(a11y) => <input {...a11y} ref={amountRef} name="amount" inputMode="decimal" className={cn(inputCompactClass, "tabular-nums")} />}
        </Field>
        <Field label="Motivo" className="w-52">
          {(a11y) => (
            <SelectWrap>
              <select {...a11y} name="category" value={category} onChange={(e) => setCategory(e.target.value as ExpenseCategory)} className={cn(selectClass, "h-11 text-sm")}>
                {Object.entries(EXPENSE_CATEGORIES).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </SelectWrap>
          )}
        </Field>
      </div>
      <FieldError state={state} name="description" />
      <FieldError state={state} name="amount" />
      {more ? (
        <div className="flex flex-wrap gap-3">
          <Field label="A quién" optional className="min-w-44 flex-1">
            {(a11y) => <input {...a11y} name="supplierName" placeholder="Nombre o razón social" className={inputCompactClass} />}
          </Field>
          <Field label="DNI o RUC" optional className="w-36">
            {(a11y) => <input {...a11y} name="supplierDocument" inputMode="numeric" className={inputCompactClass} />}
          </Field>
          <Field label="Comprobante" className="w-44">
            {(a11y) => (
              <SelectWrap>
                <select {...a11y} name="documentType" defaultValue="ninguno" className={cn(selectClass, "h-11 text-sm")}>
                  {Object.entries(EXPENSE_DOCUMENTS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </SelectWrap>
            )}
          </Field>
          <Field label="N°" optional className="w-32">
            {(a11y) => <input {...a11y} name="documentNumber" className={inputCompactClass} />}
          </Field>
        </div>
      ) : (
        <div>
          <button type="button" onClick={() => setMore(true)} className="text-sm underline underline-offset-4 hover:text-muted">
            + A quién y comprobante
          </button>
        </div>
      )}
    </>
  );
}

/** Anular un gasto: pide el motivo en el mismo lugar (sin ventanas del navegador). */
export function VoidExpenseButton({ expenseId }: { expenseId: string }) {
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState("");
  const [state, setState] = useState<ActionState>(idle);
  const [pending, start] = useTransition();
  if (!asking)
    return (
      <button key="ask" type="button" onClick={() => setAsking(true)} className={cn(buttonClass("ghost", "sm"), "px-2")}>
        Anular
      </button>
    );
  return (
    <span className="flex w-full flex-wrap items-center justify-end gap-2">
      <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="¿Por qué se anula?" aria-label="Motivo de la anulación" className={cn(inputCompactClass, "h-9 w-52")} autoFocus />
      <button
        key="confirm"
        type="button"
        disabled={pending || reason.trim().length < 3}
        onClick={() => start(async () => setState(await voidExpenseAction(expenseId, reason)))}
        className={buttonClass("danger", "sm")}
      >
        {pending ? "Anulando…" : "Sí, anular"}
      </button>
      <button type="button" onClick={() => setAsking(false)} className={buttonClass("ghost", "sm")}>
        No
      </button>
      {state.status === "error" ? <span className="w-full text-right text-xs text-danger">{state.message}</span> : null}
    </span>
  );
}

/** Efectivo que entra o sale sin ser venta ni gasto: sencillo, depósito al banco, retiro. */
export function CashMovementForm({ sessionId }: { sessionId: string }) {
  const [state, action] = useActionState(addCashMovementAction.bind(null, sessionId), idle);
  const typeRef = useRef<HTMLSelectElement>(null);
  const noteRef = useRef<HTMLInputElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);
  return (
    <form action={action} className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {QUICK_MOVEMENTS.map((m) => (
          <button
            key={m.label}
            type="button"
            onClick={() => {
              if (typeRef.current) typeRef.current.value = m.type;
              if (noteRef.current) noteRef.current.value = m.note;
              amountRef.current?.focus();
            }}
            className="h-9 rounded-full border border-line px-3.5 text-sm font-semibold hover:border-white"
          >
            {m.label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-3">
        <Field label="Tipo" className="w-36">
          {(a11y) => (
            <SelectWrap>
              <select {...a11y} ref={typeRef} name="type" defaultValue="egreso" className={cn(selectClass, "h-11 text-sm")}>
                <option value="egreso">Egreso (sale)</option>
                <option value="ingreso">Ingreso (entra)</option>
              </select>
            </SelectWrap>
          )}
        </Field>
        <Field label="Monto S/" className="w-28">
          {(a11y) => <input {...a11y} ref={amountRef} name="amount" inputMode="decimal" className={cn(inputCompactClass, "tabular-nums")} />}
        </Field>
        <Field label="Motivo" className="min-w-48 flex-1">
          {(a11y) => <input {...a11y} ref={noteRef} name="note" placeholder="Ej. Depósito al banco" className={inputCompactClass} />}
        </Field>
      </div>
      <SubmitButton variant="secondary">Registrar</SubmitButton>
      <FormAlert state={state} />
    </form>
  );
}

/** Billetes y monedas de soles, en céntimos. */
const DENOMINATIONS = [20000, 10000, 5000, 2000, 1000, 500, 200, 100, 50, 20, 10];
const denominationLabel = (c: number) => (c >= 100 ? `S/ ${c / 100}` : `S/ 0.${String(c).padStart(2, "0")}`);

/**
 * Arqueo: se cuentan los billetes y monedas del cajón (o se escribe el total) y se ve la diferencia antes de cerrar.
 * Si no cuadra, se pide el motivo.
 */
export function CloseCashForm({ sessionId, number, expectedCashCents }: { sessionId: string; number: number; expectedCashCents: number }) {
  const [state, action] = useActionState(closeCashAction.bind(null, sessionId, number), idle);
  const [byHand, setByHand] = useState(false);
  const [counts, setCounts] = useState<Record<number, number>>({});
  const [typed, setTyped] = useState("");
  const n = Number(typed.replace(",", "."));
  const typedCents = typed.trim() && Number.isFinite(n) ? Math.round(n * 100) : null;
  const countedFromBills = DENOMINATIONS.reduce((s, d) => s + d * (counts[d] ?? 0), 0);
  const countedCents = byHand ? typedCents : countedFromBills;
  const diff = countedCents === null ? null : countedCents - expectedCashCents;
  const setCount = (d: number, value: number) => setCounts((c) => ({ ...c, [d]: Math.max(0, Number.isFinite(value) ? Math.floor(value) : 0) }));
  // Sobre el valor más nuevo: dos toques seguidos suman dos.
  const bump = (d: number, delta: number) => setCounts((c) => ({ ...c, [d]: Math.max(0, (c[d] ?? 0) + delta) }));

  return (
    <form action={action} className="space-y-4">
      <p className="text-sm text-muted">
        Debería haber <span className="font-semibold text-white">{formatPrice(expectedCashCents)}</span> en efectivo.
      </p>
      <div className="flex gap-1 rounded-full border border-line bg-raised p-1 text-sm font-semibold" role="radiogroup" aria-label="Cómo contar">
        <button type="button" role="radio" aria-checked={!byHand} onClick={() => setByHand(false)} className={cn("h-9 flex-1 rounded-full px-3", !byHand ? "bg-white text-black" : "text-muted")}>
          Contar billetes y monedas
        </button>
        <button type="button" role="radio" aria-checked={byHand} onClick={() => setByHand(true)} className={cn("h-9 flex-1 rounded-full px-3", byHand ? "bg-white text-black" : "text-muted")}>
          Escribir el total
        </button>
      </div>

      {byHand ? (
        <Field label="Efectivo contado S/" className="w-44">
          {(a11y) => <input {...a11y} inputMode="decimal" value={typed} onChange={(e) => setTyped(e.target.value)} className={cn(inputCompactClass, "tabular-nums")} />}
        </Field>
      ) : (
        // Una sola columna y anchos fijos: al contar, el subtotal no mueve los botones de una fila a otra.
        <div className="grid grid-cols-1 gap-1.5 2xl:grid-cols-2">
          {DENOMINATIONS.map((d) => {
            const label = denominationLabel(d);
            return (
              <div key={d} className="flex items-center gap-2 rounded-xl bg-raised px-3 py-1.5">
                <span className="w-16 shrink-0">
                  <span className="block text-sm font-bold whitespace-nowrap">{label}</span>
                  <span className="block font-mono text-[10px] tracking-wider text-subtle uppercase">{d >= 1000 ? "Billete" : "Moneda"}</span>
                </span>
                <button type="button" aria-label={`Uno menos de ${label}`} onClick={() => bump(d, -1)} className="grid size-10 place-items-center rounded-lg border border-line bg-surface">
                  <Minus className="size-4" aria-hidden />
                </button>
                <input
                  inputMode="numeric"
                  aria-label={`Cuántos de ${label}`}
                  value={counts[d] ? String(counts[d]) : ""}
                  placeholder="0"
                  onChange={(e) => setCount(d, Number(e.target.value))}
                  className="h-10 w-12 rounded-lg border border-line bg-surface text-center font-bold tabular-nums outline-none focus:border-white"
                />
                <button type="button" aria-label={`Uno más de ${label}`} onClick={() => bump(d, 1)} className="grid size-10 place-items-center rounded-lg border border-line bg-surface">
                  <Plus className="size-4" aria-hidden />
                </button>
                <span className="min-w-20 flex-1 text-right text-sm whitespace-nowrap text-muted tabular-nums">{counts[d] ? formatPrice(d * counts[d]) : ""}</span>
              </div>
            );
          })}
        </div>
      )}

      <input type="hidden" name="counted" value={countedCents === null ? "" : String(countedCents / 100)} />
      <div
        className={cn(
          "flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3",
          diff === null ? "border-line" : diff === 0 ? "border-success/50 bg-success/10" : "border-warning/50 bg-warning/10",
        )}
      >
        <span>
          <span className="block text-xs text-muted">Contado</span>
          <span className="text-3xl font-extrabold tabular-nums">{countedCents === null ? "—" : formatPrice(countedCents)}</span>
        </span>
        {diff !== null ? (
          <span className={cn("text-lg font-bold", diff === 0 ? "text-success" : "text-warning")} aria-live="polite">
            {diff === 0 ? "Cuadra" : diff > 0 ? `Sobran ${formatPrice(diff)}` : `Faltan ${formatPrice(-diff)}`}
          </span>
        ) : null}
      </div>
      <Field label={diff ? "¿Por qué no cuadra?" : "Nota"} optional={!diff}>
        {(a11y) => <input {...a11y} name="note" required={!!diff} placeholder={diff ? "Ej. Se dio vuelto de más en una venta" : "Ej. Se depositó S/ 500 en el BCP"} className={inputCompactClass} />}
      </Field>
      <SubmitButton pendingLabel="Cerrando…" disabled={countedCents === null}>
        {countedCents === null ? "Cerrar caja" : `Cerrar caja con ${formatPrice(countedCents)}`}
      </SubmitButton>
      <FormAlert state={state} />
    </form>
  );
}
