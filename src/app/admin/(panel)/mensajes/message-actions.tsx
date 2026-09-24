"use client";

import { Check, RotateCcw, Trash2 } from "lucide-react";
import { useTransition } from "react";
import { buttonClass } from "@/components/admin/ui";
import { deleteSubscriberAction, setMessageHandledAction } from "./actions";

export function HandledButton({ id, handled }: { id: string; handled: boolean }) {
  const [pending, start] = useTransition();
  return (
    <button type="button" disabled={pending} onClick={() => start(() => setMessageHandledAction(id, !handled))} className={buttonClass(handled ? "ghost" : "primary", "sm")}>
      {handled ? <RotateCcw className="size-4" aria-hidden /> : <Check className="size-4" aria-hidden />}
      {handled ? "Volver a nuevo" : "Marcar como atendido"}
    </button>
  );
}

export function DeleteSubscriberButton({ id, email }: { id: string; email: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      aria-label={`Quitar ${email}`}
      onClick={() => {
        if (confirm(`¿Quitar a ${email} del boletín?`)) start(() => deleteSubscriberAction(id));
      }}
      className="grid size-10 place-items-center rounded-full text-muted hover:bg-raised hover:text-danger"
    >
      <Trash2 className="size-4" aria-hidden />
    </button>
  );
}
