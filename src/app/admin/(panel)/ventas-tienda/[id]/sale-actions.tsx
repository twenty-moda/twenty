"use client";

import { Minus, Plus, Printer } from "lucide-react";
import { useActionState, useState } from "react";
import { FormAlert, SubmitButton } from "@/components/admin/form-controls";
import { PrintSheet, usePrintSheet } from "@/components/admin/print-sheet";
import { PosTicket, TICKET_PAGE, type TicketCompany } from "@/components/admin/pos-ticket";
import { buttonClass } from "@/components/admin/ui";
import { Field, inputCompactClass, selectClass, SelectWrap } from "@/components/ui/form";
import { cn } from "@/lib/cn";
import { formatPrice } from "@/lib/money";
import { PAYMENT_LABEL, PAYMENT_METHODS, returnAmount, type PaymentMethod, type ReturnLine } from "@/lib/pos";
import type { PosSaleDetail } from "@/server/services/pos";
import { idle } from "../../../_lib/action-state";
import { registerReturnAction, voidSaleAction } from "../actions";

export function ReprintButton({ sale, company, fontClass }: { sale: PosSaleDetail; company: TicketCompany; fontClass: string }) {
  const { printing, print } = usePrintSheet();
  return (
    <>
      <button type="button" onClick={print} disabled={printing} className={buttonClass("secondary")}>
        <Printer className="size-4" aria-hidden /> Reimprimir ticket
      </button>
      {printing ? (
        <PrintSheet page={TICKET_PAGE} className={fontClass}>
          <PosTicket sale={sale} company={company} />
        </PrintSheet>
      ) : null}
    </>
  );
}

/** Anular: primero se pide el motivo; las prendas vuelven al stock de la tienda. */
export function VoidSaleForm({ saleId }: { saleId: string }) {
  const [state, action] = useActionState(voidSaleAction.bind(null, saleId), idle);
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button key="ask" type="button" onClick={() => setOpen(true)} className={buttonClass("danger")}>
        Anular venta
      </button>
    );
  }
  return (
    <form action={action} className="w-full max-w-md space-y-3">
      <Field label="¿Por qué se anula?">
        {(a11y) => <input {...a11y} name="reason" autoFocus placeholder="Ej. Se equivocó de talla" className={inputCompactClass} />}
      </Field>
      <div className="flex gap-2">
        <SubmitButton key="confirm" variant="danger" pendingLabel="Anulando…">
          Sí, anular
        </SubmitButton>
        <button type="button" onClick={() => setOpen(false)} className={buttonClass("ghost")}>
          Cancelar
        </button>
      </div>
      <FormAlert state={state} />
    </form>
  );
}

export type ReturnFormLine = ReturnLine & { label: string; sku: string };

/**
 * Devolver prendas: cuántas de cada línea, cómo se entrega el dinero y por qué. Lo que se devuelve es lo que se pagó
 * por esas prendas (con su parte de la promo y del descuento), igual que en la nota de crédito.
 */
export function ReturnForm({ saleId, lines, defaultMethod, creditNote }: { saleId: string; lines: ReturnFormLine[]; defaultMethod: PaymentMethod; creditNote: boolean }) {
  const [state, action] = useActionState(registerReturnAction.bind(null, saleId), idle);
  const [open, setOpen] = useState(false);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  if (!open) {
    return (
      <button key="ask" type="button" onClick={() => setOpen(true)} className={buttonClass("secondary")}>
        Devolver prendas
      </button>
    );
  }
  const left = (l: ReturnFormLine) => l.soldQty - l.returnedQty;
  const setQuantity = (l: ReturnFormLine, n: number) => setQuantities((q) => ({ ...q, [l.saleItemId]: Math.max(0, Math.min(left(l), n)) }));
  const chosen = lines.filter((l) => quantities[l.saleItemId] > 0);
  const refundCents = chosen.reduce((s, l) => s + returnAmount(l, quantities[l.saleItemId]), 0);
  const items = chosen.map((l) => ({ saleItemId: l.saleItemId, quantity: quantities[l.saleItemId] }));

  return (
    <form action={action} className="w-full space-y-4 rounded-2xl border border-line p-4">
      <p className="font-semibold">Devolver prendas</p>
      <ul className="divide-y divide-line">
        {lines.map((l) => {
          const n = quantities[l.saleItemId] ?? 0;
          return (
            <li key={l.saleItemId} className="flex flex-wrap items-center gap-3 py-2.5">
              <span className="min-w-[10rem] flex-1 text-sm">
                {l.label}
                <span className="block font-mono text-xs text-subtle">
                  {l.sku} · {l.soldQty} vendida{l.soldQty === 1 ? "" : "s"}
                  {l.returnedQty ? ` · ${l.returnedQty} ya devuelta${l.returnedQty === 1 ? "" : "s"}` : ""}
                </span>
              </span>
              {left(l) ? (
                <>
                  <div className="flex h-10 items-center rounded-xl border border-line bg-raised">
                    <button type="button" aria-label={`Una menos de ${l.sku}`} onClick={() => setQuantity(l, n - 1)} className="grid h-full w-9 place-items-center">
                      <Minus className="size-4" aria-hidden />
                    </button>
                    <span className="w-8 text-center tabular-nums">{n}</span>
                    <button type="button" aria-label={`Una más de ${l.sku}`} onClick={() => setQuantity(l, n + 1)} className="grid h-full w-9 place-items-center">
                      <Plus className="size-4" aria-hidden />
                    </button>
                  </div>
                  <span className={cn("w-20 text-right text-sm tabular-nums", n ? "font-semibold" : "text-subtle")}>{n ? formatPrice(returnAmount(l, n)) : "—"}</span>
                </>
              ) : (
                <span className="text-xs text-subtle">Devuelta</span>
              )}
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap gap-3">
        <Field label="Se devuelve por" className="w-44">
          {(a11y) => (
            <SelectWrap>
              <select {...a11y} name="refundMethod" defaultValue={defaultMethod} className={cn(selectClass, "h-11 text-sm")}>
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {PAYMENT_LABEL[m]}
                  </option>
                ))}
              </select>
            </SelectWrap>
          )}
        </Field>
        <Field label="¿Por qué se devuelve?" className="min-w-[14rem] flex-1">
          {(a11y) => <input {...a11y} name="reason" maxLength={250} placeholder="Ej. No le quedó la talla" className={inputCompactClass} />}
        </Field>
      </div>
      <input type="hidden" name="items" value={JSON.stringify(items)} />
      <p className="text-xs text-subtle">
        Las prendas vuelven al stock de la tienda y el dinero sale de la caja abierta.
        {creditNote ? " Sale una nota de crédito por lo devuelto." : ""}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <SubmitButton pendingLabel="Devolviendo…" disabled={!items.length}>
          {refundCents ? `Devolver ${formatPrice(refundCents)}` : "Elige las prendas"}
        </SubmitButton>
        <button type="button" onClick={() => setOpen(false)} className={buttonClass("ghost")}>
          Cancelar
        </button>
      </div>
      <FormAlert state={state} />
    </form>
  );
}
