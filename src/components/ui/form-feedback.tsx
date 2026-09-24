"use client";

import { CheckCircle2, CircleAlert } from "lucide-react";
import type { HTMLInputTypeAttribute, ReactNode } from "react";
import { useFormStatus } from "react-dom";
import type { ActionState } from "@/lib/action-state";
import { cn } from "@/lib/cn";
import { Field, inputClass } from "./form";

/** Botón de enviar de la tienda (blanco, grande) que se bloquea mientras se envía. */
export function SubmitButton({ children, pendingLabel = "Enviando…", className }: { children: ReactNode; pendingLabel?: string; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={cn(
        "flex h-13 w-full items-center justify-center gap-2 rounded-full bg-white px-6 text-sm font-bold tracking-wide text-black uppercase transition active:scale-[0.98] disabled:opacity-60",
        className,
      )}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}

export function FormMessage({ state, className }: { state: ActionState; className?: string }) {
  if (state.status === "idle" || !state.message) return null;
  const ok = state.status === "success";
  return (
    <p
      key={state.at}
      role={ok ? "status" : "alert"}
      className={cn("flex items-start gap-2 rounded-xl px-4 py-3 text-sm animate-fade-in", ok ? "bg-success/15 text-success" : "bg-danger/15 text-danger", className)}
    >
      {ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden /> : <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />}
      {state.message}
    </p>
  );
}

type TextFieldProps = {
  label: ReactNode;
  name: string;
  state: ActionState;
  type?: HTMLInputTypeAttribute;
  autoComplete?: string;
  inputMode?: "text" | "numeric" | "decimal" | "tel" | "email";
  placeholder?: string;
  hint?: ReactNode;
  optional?: boolean;
  required?: boolean;
  /** Con `rows`, es un textarea. */
  rows?: number;
  maxLength?: number;
  className?: string;
};

/** Campo de texto sin estado propio: muestra el error del servidor y conserva lo escrito si la acción falla. */
export function TextField({ label, name, state, rows, className, hint, optional, ...props }: TextFieldProps) {
  const defaultValue = state.values?.[name] ?? "";
  return (
    <Field label={label} error={state.fieldErrors?.[name]} hint={hint} optional={optional} className={className}>
      {(a11y) =>
        rows ? (
          <textarea {...a11y} {...props} name={name} rows={rows} defaultValue={defaultValue} className={cn(inputClass, "h-auto py-3 leading-relaxed")} />
        ) : (
          <input {...a11y} {...props} name={name} defaultValue={defaultValue} className={inputClass} />
        )
      }
    </Field>
  );
}

/** Campo trampa para bots: invisible para personas y lectores de pantalla. */
export function Honeypot() {
  return (
    <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
      <label>
        No llenar
        <input type="text" name="website" tabIndex={-1} autoComplete="off" />
      </label>
    </div>
  );
}
