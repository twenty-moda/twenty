"use client";

import { Mail } from "lucide-react";
import { useState, useTransition } from "react";
import { FormAlert } from "@/components/admin/form-controls";
import { buttonClass, formatDateTime } from "@/components/admin/ui";
import { idle, type ActionState } from "@/lib/action-state";
import { cn } from "@/lib/cn";
import { formatPrice } from "@/lib/money";
import { formatDocNumber, POS_DOCUMENT_LABEL, type PosDocumentType } from "@/lib/pos";
import type { OrderReceipt } from "@/server/services/order-receipts";
import { SunatPanel } from "../../ventas-tienda/sunat-status";
import { emailOrderReceiptAction, issueOrderReceiptAction, retryOrderReceiptAction, setOrderReceiptTypeAction } from "../actions";

const OPTIONS: { value: PosDocumentType; label: string }[] = [
  { value: "boleta", label: "Boleta" },
  { value: "factura", label: "Factura" },
  { value: "nota_venta", label: "Nota de venta" },
];

const choiceClass = (selected: boolean) =>
  cn("min-h-11 rounded-xl border px-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40", selected ? "border-white bg-white text-black" : "border-line text-white hover:border-white/60");

type Props = {
  orderId: string;
  delivered: boolean;
  /** El que sale al entregar (lo del checkout o lo que eligió el equipo). */
  type: PosDocumentType;
  /** El cliente puso RUC y razón social en el checkout. */
  canFactura: boolean;
  email: string;
  receipt: Omit<OrderReceipt, "items"> | null;
};

/**
 * Comprobante del pedido: antes de emitirlo se elige cuál (boleta, factura o nota de venta) y sale solo al pasar a
 * «Entregado»; después, su estado en SUNAT, el PDF y el correo al cliente.
 */
export function OrderReceiptPanel({ orderId, delivered, type, canFactura, email, receipt }: Props) {
  const [state, setState] = useState<ActionState>(idle);
  const [pending, startTransition] = useTransition();
  const run = (action: () => Promise<ActionState>) => startTransition(async () => setState(await action()));

  if (!receipt) {
    return (
      <div className="space-y-3">
        <div role="group" aria-label="Comprobante que sale al entregar" className="grid grid-cols-3 gap-2">
          {OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              aria-pressed={type === o.value}
              disabled={pending || (o.value === "factura" && !canFactura)}
              onClick={() => (type === o.value ? null : run(() => setOrderReceiptTypeAction(orderId, o.value)))}
              className={choiceClass(type === o.value)}
            >
              {o.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-subtle">
          {delivered
            ? "El pedido ya está entregado: emítelo aquí y le llega al cliente por correo."
            : "Sale solo cuando el pedido pase a Entregado y le llega al cliente por correo."}
          {canFactura ? "" : " Factura: el cliente no puso RUC en el checkout."}
        </p>
        {delivered ? (
          <button type="button" disabled={pending} onClick={() => run(() => issueOrderReceiptAction(orderId))} className={buttonClass("primary")}>
            {pending ? "Emitiendo…" : "Emitir y enviar"}
          </button>
        ) : null}
        <FormAlert state={state} />
      </div>
    );
  }

  const electronic = receipt.documentType === "boleta" || receipt.documentType === "factura";
  const waiting = electronic && receipt.sunatStatus !== "aceptado";
  const emailStatus = receipt.emailedAt
      ? `Enviado a ${email} el ${formatDateTime(receipt.emailedAt)}.`
      : waiting
        ? `Le llega a ${email} cuando SUNAT lo acepte.`
        : delivered
          ? `Todavía no salió el correo a ${email}: se vuelve a intentar solo.`
          : "Le llega al cliente cuando el pedido esté entregado.";

  return (
    <div className="space-y-3">
      <p className="font-medium">
        {POS_DOCUMENT_LABEL[receipt.documentType]} {formatDocNumber(receipt.series, receipt.number)} · {formatPrice(receipt.totalCents)}
      </p>
      {electronic ? (
        <SunatPanel
          doc={receipt}
          label="Comprobante en SUNAT"
          printLabel={receipt.documentType === "factura" ? "Ver factura" : "Ver boleta"}
          canRetry
          retry={async () => {
            const result = await retryOrderReceiptAction(orderId, receipt.id);
            return result.status === "error" ? (result.message ?? "No se pudo.") : null;
          }}
        />
      ) : (
        <p className="text-sm text-muted">La nota de venta no va a SUNAT.</p>
      )}
      <p className="flex items-center gap-2 text-sm">
        <Mail className="size-4 shrink-0 text-muted" aria-hidden />
        <span>{emailStatus}</span>
      </p>
      {delivered && !waiting ? (
        <button type="button" disabled={pending} onClick={() => run(() => emailOrderReceiptAction(orderId))} className={buttonClass("secondary", "sm")}>
          {pending ? "Enviando…" : receipt.emailedAt ? "Reenviar por correo" : "Enviar por correo"}
        </button>
      ) : null}
      <FormAlert state={state} />
    </div>
  );
}
