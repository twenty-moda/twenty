"use client";

import { ArrowRight } from "lucide-react";
import { useActionState, useId } from "react";
import { subscribeAction } from "@/app/(store)/_actions/subscribe";
import { idle } from "@/lib/action-state";
import { useFormStatus } from "react-dom";
import { FormMessage, Honeypot } from "../ui/form-feedback";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} aria-label="Suscribirme" className="grid size-12 shrink-0 place-items-center rounded-full bg-white text-black disabled:opacity-60">
      <ArrowRight className="size-5" aria-hidden />
    </button>
  );
}

export function SubscribeForm() {
  const [state, action] = useActionState(subscribeAction, idle);
  const id = useId();
  if (state.status === "success") return <FormMessage state={state} />;
  return (
    <form action={action} className="relative" noValidate>
      <Honeypot />
      <label htmlFor={id} className="sr-only">
        Tu email
      </label>
      <div className="flex gap-2">
        <input
          id={id}
          type="email"
          name="email"
          autoComplete="email"
          inputMode="email"
          placeholder="Tu email"
          defaultValue={state.values?.email}
          aria-invalid={state.status === "error"}
          className="h-12 min-w-0 flex-1 rounded-full border border-line bg-raised px-5 text-base outline-none placeholder:text-subtle focus:border-white aria-invalid:border-danger"
        />
        <Submit />
      </div>
      <FormMessage state={state} className="mt-2" />
    </form>
  );
}
