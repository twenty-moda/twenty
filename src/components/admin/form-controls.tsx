"use client";

import { CheckCircle2, CircleAlert } from "lucide-react";
import { useFormStatus } from "react-dom";
import type { ActionState } from "@/app/admin/_lib/action-state";
import { cn } from "@/lib/cn";
import { buttonClass } from "./ui";

export function SubmitButton({ children, pendingLabel = "Guardando…", variant = "primary", className }: { children: React.ReactNode; pendingLabel?: string; variant?: "primary" | "secondary" | "danger"; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={cn(buttonClass(variant), className)}>
      {pending ? pendingLabel : children}
    </button>
  );
}

export function FormAlert({ state }: { state: ActionState }) {
  if (state.status === "idle" || !state.message) return null;
  const ok = state.status === "success";
  return (
    <p
      key={state.at}
      role={ok ? "status" : "alert"}
      className={cn("flex items-center gap-2 rounded-xl px-4 py-3 text-sm animate-fade-in", ok ? "bg-success/15 text-success" : "bg-danger/15 text-danger")}
    >
      {ok ? <CheckCircle2 className="size-4 shrink-0" aria-hidden /> : <CircleAlert className="size-4 shrink-0" aria-hidden />}
      {state.message}
    </p>
  );
}

export function FieldError({ state, name }: { state: ActionState; name: string }) {
  const message = state.fieldErrors?.[name];
  return message ? <p className="mt-1.5 text-sm text-danger">{message}</p> : null;
}

/** Interruptor grande (visible/oculto, activo/inactivo). Envía "on" cuando está marcado. Con `checked` + `onChange` es controlado. */
export function Toggle({
  name,
  defaultChecked,
  checked,
  onChange,
  label,
  hint,
}: {
  name: string;
  defaultChecked?: boolean;
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <input
        type="checkbox"
        name={name}
        {...(checked === undefined ? { defaultChecked } : { checked, onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChange?.(e.target.checked) })}
        className="peer sr-only"
      />
      <span className="relative mt-0.5 h-6 w-11 shrink-0 rounded-full bg-raised ring-1 ring-line transition peer-checked:bg-success after:absolute after:top-0.5 after:left-0.5 after:size-5 after:rounded-full after:bg-white after:transition peer-checked:after:translate-x-5 peer-focus-visible:outline-2 peer-focus-visible:outline-white" />
      <span>
        <span className="block text-sm font-medium">{label}</span>
        {hint ? <span className="block text-xs text-muted">{hint}</span> : null}
      </span>
    </label>
  );
}
