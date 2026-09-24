"use client";

import { MessageCircle } from "lucide-react";
import { useActionState, useState } from "react";
import { FormAlert } from "@/components/admin/form-controls";
import { buttonClass } from "@/components/admin/ui";
import { inputClass } from "@/components/ui/form";
import { cn } from "@/lib/cn";
import { allowedTransitions, STATUS_INFO, type OrderStatus } from "@/lib/order-status";
import { idle } from "../../../_lib/action-state";
import { changeStatusAction, saveInternalNoteAction } from "../actions";

/** Lo que dice el botón para pasar a cada estado. */
const VERB: Record<OrderStatus, string> = {
  pendiente: "Volver a pendiente",
  por_verificar: "Pago por verificar",
  pagado: "Confirmar pago",
  en_preparacion: "En preparación",
  enviado: "Marcar como enviado",
  entregado: "Marcar como entregado",
  anulado: "Anular pedido",
  rechazado: "Rechazar pago",
};
const DANGER: OrderStatus[] = ["anulado", "rechazado"];

type StatusChangerProps = {
  orderId: string;
  status: OrderStatus;
  whatsappHref: string | null;
};

export function StatusChanger({ orderId, status, whatsappHref }: StatusChangerProps) {
  const [state, action, pending] = useActionState(changeStatusAction.bind(null, orderId), idle);
  const [confirming, setConfirming] = useState<OrderStatus | null>(null);
  const next = allowedTransitions(status);

  if (next.length === 0) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted">Este pedido está {STATUS_INFO[status].label.toLowerCase()}: ya no cambia de estado.</p>
        <FormAlert state={state} />
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium">
          Nota <span className="font-normal text-subtle">(opcional, queda en el historial)</span>
        </span>
        <input name="note" placeholder="Ej. Pagó con Yape, operación 123456" className={inputClass} />
      </label>
      <div className="flex flex-wrap gap-2">
        {next.map((to) => {
          const danger = DANGER.includes(to);
          if (danger && confirming !== to) {
            return (
              <button key={to} type="button" onClick={() => setConfirming(to)} className={buttonClass("danger")}>
                {VERB[to]}
              </button>
            );
          }
          return (
            <button
              key={to}
              type="submit"
              name="to"
              value={to}
              disabled={pending}
              className={cn(buttonClass(danger ? "danger" : to === next[0] ? "primary" : "secondary"), danger && "bg-danger/15")}
            >
              {danger ? `Sí, ${VERB[to].toLowerCase()}` : VERB[to]}
            </button>
          );
        })}
      </div>
      {confirming ? (
        <p className="text-sm text-warning">
          {confirming === "anulado" ? "Al anular, las prendas vuelven al stock." : "Al rechazar, las prendas vuelven al stock."} Toca de nuevo para confirmar.
        </p>
      ) : null}
      <FormAlert state={state} />
      {whatsappHref ? (
        <a href={whatsappHref} target="_blank" rel="noopener noreferrer" className={buttonClass("secondary")}>
          <MessageCircle className="size-4" aria-hidden /> Avisar al cliente por WhatsApp
        </a>
      ) : null}
    </form>
  );
}

export function InternalNoteForm({ orderId, note }: { orderId: string; note: string | null }) {
  const [state, action, pending] = useActionState(saveInternalNoteAction.bind(null, orderId), idle);
  return (
    <form action={action} className="space-y-3">
      <textarea
        name="note"
        rows={3}
        defaultValue={note ?? ""}
        placeholder="Solo lo ve el equipo: número de guía, recordatorios…"
        className={cn(inputClass, "h-auto py-3")}
      />
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className={buttonClass("secondary", "sm")}>
          {pending ? "Guardando…" : "Guardar nota"}
        </button>
        <FormAlert state={state} />
      </div>
    </form>
  );
}
