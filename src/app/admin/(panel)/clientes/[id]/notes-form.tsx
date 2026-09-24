"use client";

import { useActionState } from "react";
import { FormAlert } from "@/components/admin/form-controls";
import { buttonClass } from "@/components/admin/ui";
import { inputClass } from "@/components/ui/form";
import { cn } from "@/lib/cn";
import { idle } from "../../../_lib/action-state";
import { saveCustomerNotesAction } from "../actions";

export function CustomerNotesForm({ customerId, notes }: { customerId: string; notes: string | null }) {
  const [state, action, pending] = useActionState(saveCustomerNotesAction.bind(null, customerId), idle);
  return (
    <form action={action} className="space-y-3">
      <textarea name="notes" rows={4} defaultValue={notes ?? ""} placeholder="Talla que suele pedir, preferencias, recordatorios…" className={cn(inputClass, "h-auto py-3")} />
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className={buttonClass("secondary", "sm")}>
          {pending ? "Guardando…" : "Guardar"}
        </button>
        <FormAlert state={state} />
      </div>
    </form>
  );
}
