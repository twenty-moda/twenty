"use client";

import { useActionState, useState } from "react";
import { FieldError, FormAlert, SubmitButton, Toggle } from "@/components/admin/form-controls";
import { inputClass, Segmented, SelectWrap, selectClass } from "@/components/ui/form";
import { cn } from "@/lib/cn";
import { slugify } from "@/lib/slug";
import { idle } from "../../_lib/action-state";
import { saveProductAction } from "./actions";

type Option = { id: string; name: string };
type ProductFormProps = {
  productId: string | null;
  /** Prenda (con variantes) o conjunto (con piezas). Se elige al crear y no cambia. */
  kind: "single" | "outfit";
  categories: (Option & { slug?: string })[];
  fits: Option[];
  initial?: {
    name: string;
    slug: string;
    categoryId: string;
    fitId: string | null;
    description: string | null;
    sizeGuide: string | null;
    status: "active" | "draft" | "archived";
    isFeatured: boolean;
    metaTitle: string | null;
    metaDescription: string | null;
  };
};

export function ProductForm({ productId, kind, categories, fits, initial }: ProductFormProps) {
  const outfit = kind === "outfit";
  // Un conjunto nuevo va en la categoría Conjuntos si existe.
  const defaultCategory = initial?.categoryId ?? (outfit ? categories.find((c) => c.slug === "conjuntos")?.id : undefined) ?? "";
  const [state, action] = useActionState(saveProductAction.bind(null, productId), idle);
  const [status, setStatus] = useState(initial?.status ?? "draft");
  const [name, setName] = useState(initial?.name ?? "");
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const shownSlug = slug || slugify(name);

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="status" value={status} />
      <input type="hidden" name="kind" value={kind} />
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium">Nombre</span>
        <input
          name="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          placeholder={outfit ? "Ej. Conjunto Lino Boxi Fit" : "Ej. Baggy Jean T-20"}
          className={inputClass}
        />
        <FieldError state={state} name="name" />
      </label>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">Categoría</span>
          <SelectWrap>
            <select name="categoryId" defaultValue={defaultCategory} required className={selectClass}>
              <option value="" disabled>
                Elige una categoría
              </option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </SelectWrap>
          <FieldError state={state} name="categoryId" />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">
            Fit / corte <span className="font-normal text-subtle">(opcional)</span>
          </span>
          <SelectWrap>
            <select name="fitId" defaultValue={initial?.fitId ?? ""} className={selectClass}>
              <option value="">Sin fit</option>
              {fits.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </SelectWrap>
        </label>
      </div>

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium">Descripción</span>
        <textarea name="description" rows={3} defaultValue={initial?.description ?? ""} placeholder="Material, detalles, cómo le queda…" className={cn(inputClass, "h-auto py-3")} />
      </label>

      {outfit ? null : (
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">Guía de tallas</span>
          <textarea
            name="sizeGuide"
            rows={5}
            defaultValue={initial?.sizeGuide ?? ""}
            placeholder={"TALLA 28\nCintura: 80 cm\nLargo: 101 cm\n\nTALLA 30\nCintura: 82 cm"}
            className={cn(inputClass, "h-auto py-3 font-mono text-sm")}
          />
          <span className="mt-1.5 block text-xs text-muted">Escribe “TALLA …” y debajo las medidas: en la tienda se muestra como tabla.</span>
        </label>
      )}

      <div>
        <span className="mb-1.5 block text-sm font-medium">Estado</span>
        <Segmented
          label="Estado"
          value={status}
          onChange={setStatus}
          options={[
            { value: "active", label: "Publicado" },
            { value: "draft", label: "Borrador" },
            { value: "archived", label: "Archivado" },
          ]}
        />
        <span className="mt-1.5 block text-xs text-muted">
          {status === "active"
            ? outfit
              ? "Se ve en la tienda (si tiene precio y al menos 2 prendas)."
              : "Se ve en la tienda (si tiene variantes activas)."
            : status === "draft"
              ? outfit
                ? "No se ve en la tienda: útil mientras eliges las prendas y subes fotos."
                : "No se ve en la tienda. Si es pieza de un conjunto, igual se vende dentro del conjunto."
              : "Retirado de la tienda; se conserva para los pedidos."}
        </span>
      </div>

      <Toggle name="isFeatured" defaultChecked={initial?.isFeatured} label="Destacado" hint="Aparece primero en el inicio y en el catálogo." />

      <details className="group rounded-xl border border-line">
        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium">SEO y dirección web</summary>
        <div className="space-y-4 border-t border-line p-4">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Dirección</span>
            <div className="flex items-center rounded-xl border border-line bg-raised pl-4 text-sm text-muted focus-within:border-white">
              <span className="shrink-0">/product/</span>
              <input name="slug" value={shownSlug} onChange={(e) => setSlug(e.target.value)} className="h-12 min-w-0 flex-1 bg-transparent pr-4 text-base text-white outline-none" />
            </div>
            <FieldError state={state} name="slug" />
            <span className="mt-1.5 block text-xs text-muted">Si la cambias, la dirección anterior redirige sola a la nueva.</span>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Título para Google</span>
            <input name="metaTitle" defaultValue={initial?.metaTitle ?? ""} maxLength={70} placeholder={name || "Se usa el nombre del producto"} className={inputClass} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Descripción para Google</span>
            <textarea name="metaDescription" rows={2} maxLength={170} defaultValue={initial?.metaDescription ?? ""} placeholder="Se usa la descripción del producto" className={cn(inputClass, "h-auto py-3")} />
          </label>
        </div>
      </details>

      <FormAlert state={state} />
      <SubmitButton>{productId ? "Guardar cambios" : outfit ? "Crear conjunto" : "Crear producto"}</SubmitButton>
    </form>
  );
}
