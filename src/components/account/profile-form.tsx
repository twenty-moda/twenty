"use client";

import { useActionState, useState } from "react";
import { saveProfileAction } from "@/app/(store)/cuenta/actions";
import type { ActionState } from "@/lib/action-state";
import { FormMessage, SubmitButton, TextField } from "../ui/form-feedback";
import { Segmented } from "../ui/form";

type DocumentType = "dni" | "ce" | "pasaporte";
const DOCUMENTS: { value: DocumentType; label: string }[] = [
  { value: "dni", label: "DNI" },
  { value: "ce", label: "C.E." },
  { value: "pasaporte", label: "Pasaporte" },
];

/** Nombre, celular y documento: con esto se llena el checkout. El email es el de Google y no se cambia aquí. */
export function ProfileForm({ profile }: { profile: { name: string; email: string; phone: string; documentType: DocumentType; documentNumber: string } }) {
  const initial: ActionState = { status: "idle", values: { name: profile.name, phone: profile.phone, documentNumber: profile.documentNumber } };
  const [state, action] = useActionState(saveProfileAction, initial);
  const [documentType, setDocumentType] = useState<DocumentType>((state.values?.documentType as DocumentType | undefined) ?? profile.documentType);
  return (
    <form action={action} className="space-y-4" noValidate>
      <TextField label="Nombre y apellido" name="name" state={state} autoComplete="name" required />
      <TextField label="Celular" name="phone" state={state} type="tel" inputMode="tel" autoComplete="tel" placeholder="987 654 321" required />
      <div>
        <p className="mb-1.5 text-sm font-medium">Documento</p>
        <Segmented label="Tipo de documento" value={documentType} options={DOCUMENTS} onChange={setDocumentType} />
        <input type="hidden" name="documentType" value={documentType} />
      </div>
      <TextField
        label={documentType === "dni" ? "Número de DNI" : "Número de documento"}
        name="documentNumber"
        state={state}
        inputMode={documentType === "dni" ? "numeric" : "text"}
        hint="Va en tu boleta y lo piden las agencias para entregarte el paquete."
        required
      />
      <div>
        <p className="mb-1.5 text-sm font-medium">Email</p>
        <p className="flex min-h-12 items-center rounded-xl border border-line px-4 text-sm text-muted">{profile.email}</p>
        <p className="mt-1.5 text-xs text-muted">Es el de tu cuenta de Google. A este email te llegan las confirmaciones.</p>
      </div>
      <FormMessage state={state} />
      <SubmitButton pendingLabel="Guardando…">Guardar mis datos</SubmitButton>
    </form>
  );
}
