"use client";

import { Search } from "lucide-react";
import { useActionState, useState, useTransition } from "react";
import { FieldError, FormAlert, SubmitButton, Toggle } from "@/components/admin/form-controls";
import { buttonClass } from "@/components/admin/ui";
import { fieldClass, inputClass } from "@/components/ui/form";
import { cn } from "@/lib/cn";
import { formatPrice } from "@/lib/money";
import { matchesAllWords } from "@/lib/slug";
import { idle } from "../../_lib/action-state";
import { deletePromotionAction, savePromotionAction } from "./actions";

type ProductOption = { id: string; name: string; status: string; categoryName: string; minPrice: number | null };
type PromotionFormProps = {
  id: string | null;
  products: ProductOption[];
  initial?: {
    name: string;
    description: string | null;
    quantity: number;
    bundlePriceCents: number;
    isActive: boolean;
    startsAt: string;
    endsAt: string;
    productIds: string[];
  };
};

export function PromotionForm({ id, products, initial }: PromotionFormProps) {
  const [state, action] = useActionState(savePromotionAction.bind(null, id), idle);
  const [quantity, setQuantity] = useState(String(initial?.quantity ?? 2));
  const [price, setPrice] = useState(initial ? String(initial.bundlePriceCents / 100) : "");
  const [selected, setSelected] = useState<Set<string>>(new Set(initial?.productIds ?? []));
  const [query, setQuery] = useState("");
  const [deleting, startDelete] = useTransition();

  const q = Number(quantity);
  const p = Number(price.replace(",", "."));
  const unit = q >= 2 && p > 0 ? Math.round((p * 100) / q) : null;
  const visible = products.filter((x) => matchesAllWords(`${x.name} ${x.categoryName}`, query));
  const categories = [...new Set(products.map((x) => x.categoryName))];
  const toggle = (ids: string[], on: boolean) =>
    setSelected((s) => {
      const next = new Set(s);
      for (const i of ids) {
        if (on) next.add(i);
        else next.delete(i);
      }
      return next;
    });

  return (
    <form action={action} className="space-y-6">
      {[...selected].map((pid) => (
        <input key={pid} type="hidden" name="productIds" value={pid} />
      ))}

      <div className="rounded-2xl bg-raised p-5">
        <p className="text-sm text-muted">La promo</p>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-lg font-semibold">
          Lleva
          <input
            name="quantity"
            inputMode="numeric"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value.replace(/\D/g, ""))}
            aria-label="Cantidad de prendas"
            className={cn(fieldClass, "h-12 w-20 bg-ink px-2 text-center text-lg")}
          />
          prendas por S/
          <input
            name="bundlePrice"
            inputMode="decimal"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            aria-label="Precio del paquete"
            className={cn(fieldClass, "h-12 w-28 bg-ink px-2 text-center text-lg")}
          />
        </div>
        <p className="mt-2 text-sm text-muted">
          {unit ? `Cada prenda queda a ${formatPrice(unit)}. Si lleva más, cada una sigue a ${formatPrice(unit)}. Se pueden combinar colores y tallas.` : "Escribe la cantidad y el precio."}
        </p>
        <FieldError state={state} name="quantity" />
        <FieldError state={state} name="bundlePriceCents" />
      </div>

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium">Nombre interno</span>
        <input name="name" defaultValue={initial?.name ?? ""} placeholder="Ej. 2 x 100 Mom Jean" className={inputClass} />
        <FieldError state={state} name="name" />
      </label>

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium">
          Nota <span className="font-normal text-subtle">(opcional)</span>
        </span>
        <input name="description" defaultValue={initial?.description ?? ""} placeholder="Para el equipo: de dónde sale la promo, hasta cuándo…" className={inputClass} />
      </label>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">
            Empieza <span className="font-normal text-subtle">(opcional)</span>
          </span>
          <input type="datetime-local" name="startsAt" defaultValue={initial?.startsAt ?? ""} className={inputClass} />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">
            Termina <span className="font-normal text-subtle">(opcional)</span>
          </span>
          <input type="datetime-local" name="endsAt" defaultValue={initial?.endsAt ?? ""} className={inputClass} />
          <FieldError state={state} name="endsAt" />
        </label>
      </div>

      <Toggle name="isActive" defaultChecked={initial?.isActive ?? true} label="Promo activa" hint="Si la apagas, deja de mostrarse y de aplicarse." />

      <fieldset className="min-w-0 space-y-3">
        <legend className="text-sm font-medium">
          Productos de la promo <span className="text-muted">({selected.size} elegidos)</span>
        </legend>
        <FieldError state={state} name="productIds" />
        <div className="flex flex-wrap gap-2">
          {categories.map((c) => {
            const ids = products.filter((x) => x.categoryName === c).map((x) => x.id);
            const all = ids.every((i) => selected.has(i));
            return (
              <button key={c} type="button" onClick={() => toggle(ids, !all)} className={cn(buttonClass("secondary", "sm"), all && "border-white")}>
                {all ? "Quitar" : "Todos"} {c}
              </button>
            );
          })}
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar producto" className={cn(inputClass, "pl-11")} />
        </div>
        <ul className="max-h-80 divide-y divide-line overflow-y-auto rounded-xl border border-line">
          {visible.map((x) => (
            <li key={x.id}>
              <label className="flex cursor-pointer items-center gap-3 px-4 py-3 text-sm hover:bg-raised">
                <input type="checkbox" checked={selected.has(x.id)} onChange={(e) => toggle([x.id], e.target.checked)} className="size-5 accent-white" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{x.name}</span>
                  <span className="block text-xs text-muted">
                    {x.categoryName}
                    {x.status !== "active" ? " · no publicado" : ""}
                  </span>
                </span>
                <span className="text-muted">{x.minPrice ? formatPrice(x.minPrice) : "—"}</span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>

      <FormAlert state={state} />
      <div className="flex flex-wrap gap-2">
        <SubmitButton>{id ? "Guardar promoción" : "Crear promoción"}</SubmitButton>
        {id ? (
          <button
            type="button"
            disabled={deleting}
            onClick={() => {
              if (window.confirm("¿Eliminar esta promoción?")) startDelete(() => deletePromotionAction(id));
            }}
            className={buttonClass("danger")}
          >
            Eliminar
          </button>
        ) : null}
      </div>
    </form>
  );
}
