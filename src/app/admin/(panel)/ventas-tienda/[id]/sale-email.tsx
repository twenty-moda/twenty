"use client";

import { Mail } from "lucide-react";
import { useActionState, useState } from "react";
import { FormAlert, SubmitButton } from "@/components/admin/form-controls";
import { buttonClass, formatDateTime } from "@/components/admin/ui";
import { inputCompactClass } from "@/components/ui/form";
import { cn } from "@/lib/cn";
import { idle } from "../../../_lib/action-state";
import { sendSaleReceiptAction } from "../actions";

type Props = {
  saleId: string;
  email: string | null;
  emailedAt: Date | null;
  /** Boleta o factura que SUNAT todavía no aceptó: el correo sale cuando la acepte. */
  waiting: boolean;
};

/** El comprobante por correo (opcional): a quién y cuándo se mandó, y mandarlo o reenviarlo a un correo. */
export function SaleEmail({ saleId, email, emailedAt, waiting }: Props) {
  const [state, action] = useActionState(sendSaleReceiptAction.bind(null, saleId), idle);
  // Cuándo se abrió el formulario: se cierra solo cuando sale bien un envío hecho después de abrirlo.
  const [openedAt, setOpenedAt] = useState(0);
  const open = openedAt > 0 && !(state.status === "success" && (state.at ?? 0) > openedAt);
  const status = !email
    ? "No se le mandó por correo."
    : emailedAt
      ? `Enviado a ${email} el ${formatDateTime(emailedAt)}.`
      : waiting
        ? `Le llega a ${email} cuando SUNAT acepte el comprobante.`
        : `Todavía no salió el correo a ${email}: se vuelve a intentar con la venta siguiente.`;

  return (
    <section aria-label="Comprobante por correo" className="space-y-3 rounded-2xl border border-line p-4">
      <p className="flex items-center gap-2 text-sm">
        <Mail className="size-4 shrink-0 text-muted" aria-hidden />
        <span>{status}</span>
      </p>
      {open ? (
        <form action={action} className="flex flex-wrap items-start gap-2">
          <input
            name="email"
            type="email"
            inputMode="email"
            autoComplete="off"
            aria-label="Correo del cliente"
            defaultValue={state.values?.email ?? email ?? ""}
            autoFocus
            placeholder="correo@ejemplo.com"
            className={cn(inputCompactClass, "min-w-0 flex-1 basis-60")}
          />
          <SubmitButton key="send" pendingLabel="Enviando…">
            Enviar
          </SubmitButton>
          <button type="button" onClick={() => setOpenedAt(0)} className={buttonClass("ghost")}>
            Cancelar
          </button>
        </form>
      ) : (
        <button key="open" type="button" onClick={() => setOpenedAt(Date.now())} className={buttonClass("secondary", "sm")}>
          {emailedAt ? "Reenviar por correo" : "Enviar por correo"}
        </button>
      )}
      <FormAlert state={state} />
    </section>
  );
}
