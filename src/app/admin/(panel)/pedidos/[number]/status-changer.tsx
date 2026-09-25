"use client";

import { MessageCircle } from "lucide-react";
import { useActionState, useState } from "react";
import { FormAlert, Toggle } from "@/components/admin/form-controls";
import { buttonClass } from "@/components/admin/ui";
import { inputClass } from "@/components/ui/form";
import { cn } from "@/lib/cn";
import { COURIER_NAME, GUIDE_FIELDS, guideCodeText, type Courier, type CourierGuide } from "@/lib/couriers";
import { allowedTransitions, STATUS_INFO, type OrderStatus } from "@/lib/order-status";
import type { RefundOptions } from "@/server/services/refunds";
import { idle } from "../../../_lib/action-state";
import { changeStatusAction, saveInternalNoteAction, saveTrackingAction } from "../actions";
import { CancelRefundFields } from "./refund-fields";

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
  /** Resend configurado: se puede avisar al cliente por email. */
  emailEnabled: boolean;
  /** Pedido por Shalom u Olva: al marcarlo como enviado se puede anotar la guía (la que ya tenga, si hay). */
  guide?: { courier: Courier; tracking: CourierGuide | null } | null;
  /** Dinero pagado sin devolver: al anular se ofrece devolverlo. */
  refund?: Pick<RefundOptions, "availableCents" | "culqi" | "items"> | null;
};

export function StatusChanger({ orderId, status, whatsappHref, emailEnabled, guide = null, refund = null }: StatusChangerProps) {
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
          Nota interna <span className="font-normal text-subtle">(opcional, solo la ve el equipo)</span>
        </span>
        <input name="note" placeholder="Ej. Pagó con Yape, operación 123456" className={inputClass} />
      </label>
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium">
          Mensaje para el cliente{" "}
          <span className="font-normal text-subtle">(opcional, lo ve en {emailEnabled ? "el email y en " : ""}la página de su pedido)</span>
        </span>
        <input
          name="customerMessage"
          maxLength={1000}
          placeholder={`Ej. ${guide?.courier === "olva" ? "Tu paquete ya está en la agencia Olva" : "Tu clave de recojo en Shalom es 1234"}`}
          className={inputClass}
        />
      </label>
      {guide && next.includes("enviado") ? (
        <TrackingFields courier={guide.courier} tracking={guide.tracking} hint="Si ya lo despachaste, anótala: va en el email de «enviado» y el cliente sigue su envío." />
      ) : null}
      {emailEnabled ? <Toggle name="notifyCustomer" defaultChecked label="Avisar al cliente por email" hint="Le llega un email con el nuevo estado de su pedido." /> : null}
      {confirming === "anulado" && refund && refund.availableCents > 0 ? <CancelRefundFields options={refund} /> : null}
      <div className="flex flex-wrap gap-2">
        {next.map((to) => {
          const danger = DANGER.includes(to);
          if (danger && confirming !== to) {
            // Otra `key` que el botón de confirmar: si React reusara el mismo <button> y le cambiara el type a
            // "submit" durante el clic, el navegador enviaría el formulario con ese mismo toque (sin confirmar).
            return (
              <button key={`${to}:preguntar`} type="button" onClick={() => setConfirming(to)} className={buttonClass("danger")}>
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
          {confirming === "anulado" ? "Al anular, las prendas vuelven al stock (menos las agotadas)." : "Al rechazar, las prendas vuelven al stock."} Toca de
          nuevo para confirmar.
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

function TrackingFields({ courier, tracking, hint }: { courier: Courier; tracking: CourierGuide | null; hint?: string }) {
  const name = COURIER_NAME[courier];
  const fields = GUIDE_FIELDS[courier];
  return (
    <fieldset className="min-w-0 space-y-2">
      <legend className="mb-1.5 text-sm font-medium">
        Guía de {name} <span className="font-normal text-subtle">(opcional)</span>
      </legend>
      <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-2">
        <input
          name="trackingNumber"
          defaultValue={tracking?.number ?? ""}
          inputMode="numeric"
          placeholder={`${fields.number} (${fields.numberHint})`}
          aria-label={`${fields.number} de ${name}`}
          className={inputClass}
        />
        <input
          name="trackingCode"
          defaultValue={tracking ? guideCodeText(courier, tracking.code) : ""}
          inputMode={courier === "olva" ? "numeric" : undefined}
          placeholder={fields.codeHint}
          aria-label={`${fields.code} de ${name}`}
          maxLength={fields.codeMaxLength}
          className={cn(inputClass, "uppercase")}
        />
      </div>
      {courier === "olva" ? <p className="text-xs text-muted">El año de la guía; si lo dejas vacío, se usa el de este año.</p> : null}
      {hint ? <p className="text-xs text-muted">{hint}</p> : null}
    </fieldset>
  );
}

/** Anotar o corregir la guía de Shalom u Olva en cualquier momento. */
export function TrackingForm({ orderId, courier, tracking }: { orderId: string; courier: Courier; tracking: CourierGuide | null }) {
  const [state, action, pending] = useActionState(saveTrackingAction.bind(null, orderId), idle);
  return (
    <form action={action} className="space-y-3">
      <TrackingFields courier={courier} tracking={tracking} />
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className={buttonClass("secondary", "sm")}>
          {pending ? "Guardando…" : "Guardar guía"}
        </button>
        <FormAlert state={state} />
      </div>
    </form>
  );
}
