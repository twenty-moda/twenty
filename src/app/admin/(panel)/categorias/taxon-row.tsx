"use client";

import { ImagePlus, Trash2 } from "lucide-react";
import Image from "next/image";
import { useActionState, useState, useTransition } from "react";
import { FormAlert, SubmitButton } from "@/components/admin/form-controls";
import { buttonClass } from "@/components/admin/ui";
import { inputClass } from "@/components/ui/form";
import { cn } from "@/lib/cn";
import { resizeForUpload } from "@/lib/resize-image";
import { idle, type ActionState } from "../../_lib/action-state";
import { deleteTaxonAction, saveTaxonAction, uploadTaxonImageAction } from "./actions";

type Taxon = { id: string; name: string; slug: string; isVisible: boolean; products: number; position?: number; image?: string | null };

export function TaxonRow({ kind, taxon }: { kind: "category" | "fit"; taxon: Taxon }) {
  const [state, action] = useActionState(saveTaxonAction.bind(null, kind, taxon.id), idle);
  const [extra, setExtra] = useState<ActionState>(idle);
  const [pending, startTransition] = useTransition();

  return (
    <li className="py-4">
      <form action={action} className="flex flex-wrap items-center gap-3">
        {kind === "category" ? (
          <label className="relative grid size-14 shrink-0 cursor-pointer place-items-center overflow-hidden rounded-lg bg-raised" title="Cambiar imagen">
            {taxon.image ? <Image src={taxon.image} alt="" fill sizes="56px" className="object-cover" /> : <ImagePlus className="size-5 text-muted" aria-hidden />}
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const fd = new FormData();
                fd.set("file", await resizeForUpload(file, 900));
                startTransition(async () => setExtra(await uploadTaxonImageAction(kind, taxon.id, fd)));
              }}
            />
          </label>
        ) : null}
        <input name="name" defaultValue={taxon.name} aria-label="Nombre" className={cn(inputClass, "h-11 min-w-40 flex-1")} />
        {kind === "category" ? (
          <input name="position" type="number" min={0} defaultValue={taxon.position} aria-label="Orden en el menú" title="Orden en el menú" className={cn(inputClass, "h-11 w-20")} />
        ) : null}
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="isVisible" defaultChecked={taxon.isVisible} className="size-5 accent-white" /> Visible
        </label>
        <span className="text-xs text-muted">
          {taxon.products} {taxon.products === 1 ? "producto" : "productos"}
        </span>
        <SubmitButton variant="secondary" className="h-9 px-4 text-xs">
          Guardar
        </SubmitButton>
        <button
          type="button"
          aria-label={`Eliminar ${taxon.name}`}
          disabled={pending}
          onClick={() => {
            if (window.confirm(`¿Eliminar "${taxon.name}"?`)) startTransition(async () => setExtra(await deleteTaxonAction(kind, taxon.id)));
          }}
          className={cn(buttonClass("ghost", "sm"), "hover:text-danger")}
        >
          <Trash2 className="size-4" aria-hidden />
        </button>
      </form>
      <div className="mt-2 space-y-2 empty:hidden">
        <FormAlert state={state} />
        <FormAlert state={extra} />
      </div>
    </li>
  );
}

export function NewTaxonForm({ kind }: { kind: "category" | "fit" }) {
  const [state, action] = useActionState(saveTaxonAction.bind(null, kind, null), idle);
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <input name="name" placeholder={kind === "category" ? "Nueva categoría (ej. Bermudas)" : "Nuevo fit (ej. Wide Leg)"} className={cn(inputClass, "h-11 min-w-48 flex-1")} />
      <input type="hidden" name="isVisible" value="on" />
      <SubmitButton variant="primary" className="h-11">
        Agregar
      </SubmitButton>
      <div className="basis-full empty:hidden">
        <FormAlert state={state} />
      </div>
    </form>
  );
}
