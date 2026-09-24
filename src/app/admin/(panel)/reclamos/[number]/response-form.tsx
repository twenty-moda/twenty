"use client";

import { useActionState } from "react";
import { FieldError, FormAlert, SubmitButton, Toggle } from "@/components/admin/form-controls";
import { inputClass } from "@/components/ui/form";
import { cn } from "@/lib/cn";
import { idle } from "../../../_lib/action-state";
import { respondComplaintAction } from "../actions";

export function ResponseForm({ number, response, email }: { number: number; response: string | null; email: string }) {
  const [state, action] = useActionState(respondComplaintAction.bind(null, number), idle);
  return (
    <form action={action} className="space-y-4">
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium">Respuesta al cliente</span>
        <textarea
          name="response"
          rows={7}
          defaultValue={response ?? ""}
          placeholder="Explica qué se hizo o qué solución se ofrece (cambio, devolución, disculpas…)."
          className={cn(inputClass, "h-auto py-3 leading-relaxed")}
        />
        <FieldError state={state} name="response" />
      </label>
      <Toggle name="notify" defaultChecked label={`Enviar la respuesta a ${email}`} hint="La norma pide responder por el medio que eligió el consumidor (su email)." />
      <FormAlert state={state} />
      <SubmitButton>{response ? "Guardar cambios" : "Guardar respuesta"}</SubmitButton>
    </form>
  );
}
