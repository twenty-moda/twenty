"use client";

import { UserMinus } from "lucide-react";
import { useActionState, useState, useTransition } from "react";
import { FieldError, FormAlert, SubmitButton, Toggle } from "@/components/admin/form-controls";
import { buttonClass } from "@/components/admin/ui";
import { inputClass } from "@/components/ui/form";
import { idle, type ActionState } from "../../_lib/action-state";
import { addAdminAction, removeAdminAction } from "./actions";

export function AddAdminForm({ emailEnabled }: { emailEnabled: boolean }) {
  const [state, action] = useActionState(addAdminAction, idle);
  return (
    <form key={state.status === "success" ? state.at : "form"} action={action} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">Nombre</span>
          <input name="name" required autoComplete="off" placeholder="Ej. Ana Torres" className={inputClass} />
          <FieldError state={state} name="name" />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">Correo</span>
          <input name="email" type="email" required autoComplete="off" inputMode="email" placeholder="ana@gmail.com" className={inputClass} />
          <FieldError state={state} name="email" />
          <span className="mt-1.5 block text-xs text-muted">Si entrará con Google, el correo de su cuenta de Google.</span>
        </label>
      </div>
      {emailEnabled ? <Toggle name="notify" defaultChecked label="Enviarle un correo con las instrucciones para entrar" /> : null}
      <FormAlert state={state} />
      <SubmitButton pendingLabel="Dando acceso…">Dar acceso al panel</SubmitButton>
    </form>
  );
}

export function RemoveAdminButton({ id, name }: { id: string; name: string }) {
  const [pending, start] = useTransition();
  const [state, setState] = useState<ActionState>(idle);
  return (
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (window.confirm(`¿Quitarle el acceso al panel a ${name}? Su cuenta de la tienda sigue igual.`)) start(async () => setState(await removeAdminAction(id)));
        }}
        className={buttonClass("ghost", "sm")}
      >
        <UserMinus className="size-4" aria-hidden /> {pending ? "Quitando…" : "Quitar acceso"}
      </button>
      {state.status === "error" ? <FormAlert state={state} /> : null}
    </div>
  );
}
