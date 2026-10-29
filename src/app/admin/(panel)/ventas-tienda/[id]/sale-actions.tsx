"use client";

import { Printer } from "lucide-react";
import { useActionState, useState } from "react";
import { FormAlert, SubmitButton } from "@/components/admin/form-controls";
import { PrintSheet, usePrintSheet } from "@/components/admin/print-sheet";
import { PosTicket, TICKET_PAGE, type TicketCompany } from "@/components/admin/pos-ticket";
import { buttonClass } from "@/components/admin/ui";
import { Field, inputCompactClass } from "@/components/ui/form";
import type { PosSaleDetail } from "@/server/services/pos";
import { idle } from "../../../_lib/action-state";
import { voidSaleAction } from "../actions";

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
