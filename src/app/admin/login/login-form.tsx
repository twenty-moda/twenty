"use client";

import { useActionState } from "react";
import { Field, inputClass } from "@/components/ui/form";
import { idle } from "../_lib/action-state";
import { loginAction } from "./actions";

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, idle);
  return (
    <form action={action} className="space-y-4">
      <Field label="Email">
        {(p) => <input {...p} name="email" type="email" autoComplete="username" required autoFocus className={inputClass} />}
      </Field>
      <Field label="Contraseña">
        {(p) => <input {...p} name="password" type="password" autoComplete="current-password" required className={inputClass} />}
      </Field>
      {state.status === "error" ? (
        <p role="alert" className="rounded-xl bg-danger/15 px-4 py-3 text-sm text-danger">
          {state.message}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="h-12 w-full rounded-full bg-white text-sm font-bold tracking-wide text-black uppercase disabled:opacity-60"
      >
        {pending ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
