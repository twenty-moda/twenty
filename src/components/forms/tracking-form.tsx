"use client";

import { Search } from "lucide-react";
import { useActionState } from "react";
import { trackOrderAction } from "@/app/(store)/tracking/actions";
import { idle } from "@/lib/action-state";
import { FormMessage, SubmitButton, TextField } from "../ui/form-feedback";

export function TrackingForm() {
  const [state, action] = useActionState(trackOrderAction, idle);
  return (
    <form action={action} className="space-y-4" noValidate>
      <TextField label="Número de pedido" name="number" state={state} inputMode="numeric" placeholder="Ej: 1024" hint="Está en tu confirmación, con el símbolo #." required />
      <TextField label="Celular o email de la compra" name="contact" state={state} autoComplete="email" placeholder="987 654 321 o tu@correo.com" required />
      <FormMessage state={state} />
      <SubmitButton pendingLabel="Buscando…">
        <Search className="size-4" aria-hidden /> Ver mi pedido
      </SubmitButton>
    </form>
  );
}
