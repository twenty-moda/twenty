"use client";

import { Check, CheckCircle2, Mail, MessageCircle, Reply, RotateCcw, Trash2 } from "lucide-react";
import { useActionState, useRef, useState, useTransition } from "react";
import { FieldError, FormAlert, SubmitButton } from "@/components/admin/form-controls";
import { buttonClass } from "@/components/admin/ui";
import { inputClass } from "@/components/ui/form";
import { cn } from "@/lib/cn";
import { whatsappUrl } from "@/lib/links";
import { idle, type ActionState } from "../../_lib/action-state";
import { deleteSubscriberAction, recordWhatsappReplyAction, replyByEmailAction, setMessageHandledAction } from "./actions";

type MessageActionsProps = {
  id: string;
  name: string;
  email: string;
  /** Celular con código de país (51…) si el cliente lo dejó: habilita responder por WhatsApp. */
  whatsapp: string | null;
  handled: boolean;
  /** Si el envío de emails está configurado (Resend). */
  emailEnabled: boolean;
  /** Adonde llega lo que el cliente conteste. */
  replyTo: string;
};

/**
 * Responder (por email o WhatsApp, con el mismo texto) y marcar como atendido. Al responder, el mensaje pasa solo a
 * atendidos; la tarjeta queda a la vista con la confirmación hasta cambiar de pestaña.
 */
export function MessageActions({ id, name, email, whatsapp, handled, emailEnabled, replyTo }: MessageActionsProps) {
  const firstName = name.trim().split(/\s+/)[0];
  const greeting = `Hola ${firstName},\n\n`;
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(greeting);
  const [sent, setSent] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const finish = (message: string) => {
    setSent(message);
    setOpen(false);
    setText(greeting);
  };
  const [state, action] = useActionState(async (prev: ActionState, fd: FormData) => {
    const result = await replyByEmailAction(id, prev, fd);
    if (result.status === "success") finish(result.message ?? "Respuesta enviada.");
    return result;
  }, idle);

  const openComposer = () => {
    setOpen(true);
    setSent(null);
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      el?.focus();
      el?.setSelectionRange(el.value.length, el.value.length);
    });
  };

  const done = handled || !!sent;

  return (
    <div className="mt-4 space-y-3">
      {sent ? (
        <p role="status" className="flex items-center gap-2 rounded-xl bg-success/15 px-4 py-3 text-sm text-success animate-fade-in">
          <CheckCircle2 className="size-4 shrink-0" aria-hidden /> {sent}
        </p>
      ) : null}

      {open ? (
        <form action={action} className="space-y-3 rounded-xl border border-line bg-raised/40 p-3 md:p-4">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Tu respuesta a {firstName}</span>
            <textarea
              ref={textareaRef}
              name="body"
              rows={6}
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={5000}
              className={cn(inputClass, "h-auto py-3 leading-relaxed")}
            />
            <FieldError state={state} name="body" />
          </label>
          <FormAlert state={state} />
          <div className="flex flex-wrap gap-2">
            {emailEnabled ? (
              <SubmitButton pendingLabel="Enviando…">
                <Mail className="size-4" aria-hidden /> Enviar por email
              </SubmitButton>
            ) : null}
            {whatsapp ? (
              <a
                href={whatsappUrl(whatsapp, text.trim())}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => {
                  const body = text;
                  start(async () => {
                    await recordWhatsappReplyAction(id, body);
                    finish("Se abrió WhatsApp con tu respuesta. El mensaje pasó a Atendidos.");
                  });
                }}
                className={buttonClass(emailEnabled ? "secondary" : "primary")}
              >
                <MessageCircle className="size-4" aria-hidden /> Enviar por WhatsApp
              </a>
            ) : null}
            <button type="button" onClick={() => setOpen(false)} className={buttonClass("ghost")}>
              Cancelar
            </button>
          </div>
          <p className="text-xs text-subtle">
            {emailEnabled
              ? `El email le llega a ${email} con el diseño de TWENTY y su mensaje debajo.${replyTo ? ` Si contesta, la respuesta llega a ${replyTo}.` : ""}`
              : "El envío de emails no está configurado en este entorno."}
          </p>
        </form>
      ) : (
        <div className="flex flex-wrap gap-2">
          {emailEnabled || whatsapp ? (
            <button type="button" onClick={openComposer} className={buttonClass(done ? "secondary" : "primary", "sm")}>
              <Reply className="size-4" aria-hidden /> {sent || handled ? "Responder de nuevo" : "Responder"}
            </button>
          ) : null}
          {sent ? null : <HandledButton id={id} handled={handled} disabled={pending} />}
        </div>
      )}
    </div>
  );
}

function HandledButton({ id, handled, disabled }: { id: string; handled: boolean; disabled?: boolean }) {
  const [pending, start] = useTransition();
  return (
    <button type="button" disabled={pending || disabled} onClick={() => start(() => setMessageHandledAction(id, !handled))} className={buttonClass(handled ? "ghost" : "secondary", "sm")}>
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
