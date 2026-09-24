"use client";

import { Send } from "lucide-react";
import { useActionState } from "react";
import { contactAction } from "@/app/(store)/contacto/actions";
import { idle } from "@/lib/action-state";
import { FormMessage, Honeypot, SubmitButton, TextField } from "../ui/form-feedback";

export function ContactForm() {
  const [state, action] = useActionState(contactAction, idle);
  if (state.status === "success") return <FormMessage state={state} className="py-5 text-base" />;
  return (
    <form action={action} className="relative space-y-4" noValidate>
      <Honeypot />
      <TextField label="Nombre" name="name" state={state} autoComplete="name" required />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField label="Email" name="email" type="email" state={state} autoComplete="email" inputMode="email" required />
        <TextField label="Celular" name="phone" type="tel" state={state} autoComplete="tel" inputMode="tel" optional />
      </div>
      <TextField label="Mensaje" name="message" state={state} rows={5} maxLength={3000} placeholder="¿En qué te ayudamos?" required />
      <FormMessage state={state} />
      <SubmitButton>
        <Send className="size-4" aria-hidden /> Enviar mensaje
      </SubmitButton>
    </form>
  );
}
