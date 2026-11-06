"use client";

import { useActionState, useState, useTransition } from "react";
import { FieldError, FormAlert, SubmitButton, Toggle } from "@/components/admin/form-controls";
import { ProductPicker, type ProductOption } from "@/components/admin/product-picker";
import { buttonClass } from "@/components/admin/ui";
import { fieldClass, inputClass } from "@/components/ui/form";
import { cn } from "@/lib/cn";
import { formatPrice } from "@/lib/money";
import { idle } from "../../_lib/action-state";
import { deletePromotionAction, savePromotionAction } from "./actions";
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
  const [deleting, startDelete] = useTransition();

  const q = Number(quantity);
  const p = Number(price.replace(",", "."));
  const unit = q >= 2 && p > 0 ? Math.round((p * 100) / q) : null;

  return (
    <form action={action} className="space-y-6">
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

      <ProductPicker
        name="productIds"
        legend="Productos de la promo"
        products={products}
        selected={selected}
        onChange={setSelected}
        error={<FieldError state={state} name="productIds" />}
      />

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
