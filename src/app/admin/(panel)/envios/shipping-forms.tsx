"use client";

import { Trash2 } from "lucide-react";
import { useActionState, useState, useTransition } from "react";
import { FormAlert, SubmitButton, Toggle } from "@/components/admin/form-controls";
import { buttonClass } from "@/components/admin/ui";
import { DistrictSearch, type PickedDistrict } from "@/components/checkout/district-search";
import { inputClass } from "@/components/ui/form";
import { cn } from "@/lib/cn";
import { idle, type ActionState } from "../../_lib/action-state";
import { saveDeliveryPricesAction, saveShippingMethodAction } from "./actions";

type Method = { id: string; name: string; description: string | null; details: string[]; isActive: boolean; kind: string };

export function ShippingMethodForm({ method }: { method: Method }) {
  const [state, action] = useActionState(saveShippingMethodAction.bind(null, method.id), idle);
  return (
    <form action={action} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">Nombre</span>
          <input name="name" defaultValue={method.name} className={inputClass} />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">Descripción corta</span>
          <input name="description" defaultValue={method.description ?? ""} className={inputClass} />
        </label>
      </div>
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium">Detalles que ve el cliente</span>
        <textarea name="details" rows={3} defaultValue={method.details.join("\n")} className={cn(inputClass, "h-auto py-3")} />
        <span className="mt-1.5 block text-xs text-muted">Uno por línea. Aparecen al elegir esta opción en el checkout.</span>
      </label>
      <Toggle name="isActive" defaultChecked={method.isActive} label="Disponible en el checkout" />
      <FormAlert state={state} />
      <SubmitButton>Guardar</SubmitButton>
    </form>
  );
}

type District = { ubigeo: string; name: string; province: string; deliveryPriceCents: number | null };

export function DeliveryPricesEditor({ districts }: { districts: District[] }) {
  const [rows, setRows] = useState(() => districts.map((d) => ({ ...d, price: d.deliveryPriceCents ? String(d.deliveryPriceCents / 100) : "" })));
  const [removed, setRemoved] = useState<string[]>([]);
  const [adding, setAdding] = useState<PickedDistrict | null>(null);
  const [state, setState] = useState<ActionState>(idle);
  const [pending, startTransition] = useTransition();
  const [dirty, setDirty] = useState(false);

  const toCents = (v: string) => {
    const n = Number(v.replace(",", "."));
    return v.trim() && Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
  };

  const save = () =>
    startTransition(async () => {
      const updates = [...rows.map((r) => ({ ubigeo: r.ubigeo, priceCents: toCents(r.price) })), ...removed.map((ubigeo) => ({ ubigeo, priceCents: null }))];
      const result = await saveDeliveryPricesAction(updates);
      setState(result);
      if (result.status === "success") {
        setDirty(false);
        setRemoved([]);
      }
    });

  return (
    <div className="space-y-4">
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {rows.map((r) => (
          <li key={r.ubigeo} className="flex items-center gap-2 rounded-xl border border-line px-3 py-2">
            <span className="min-w-0 flex-1 truncate text-sm">
              {r.name}
              {r.province !== "Lima" ? <span className="text-muted"> · {r.province}</span> : null}
            </span>
            <label className="flex h-10 items-center gap-1 rounded-lg border border-line bg-raised px-2 text-sm">
              <span className="text-muted">S/</span>
              <input
                inputMode="decimal"
                aria-label={`Precio delivery ${r.name}`}
                value={r.price}
                onChange={(e) => {
                  const price = e.target.value;
                  setRows((rs) => rs.map((x) => (x.ubigeo === r.ubigeo ? { ...x, price } : x)));
                  setDirty(true);
                }}
                className="w-12 bg-transparent tabular-nums outline-none"
              />
            </label>
            <button
              type="button"
              aria-label={`Quitar delivery en ${r.name}`}
              onClick={() => {
                setRows((rs) => rs.filter((x) => x.ubigeo !== r.ubigeo));
                setRemoved((xs) => [...xs, r.ubigeo]);
                setDirty(true);
              }}
              className="grid size-9 place-items-center text-subtle hover:text-danger"
            >
              <Trash2 className="size-4" aria-hidden />
            </button>
          </li>
        ))}
      </ul>

      <div className="rounded-xl bg-raised p-4">
        <p className="mb-2 text-sm font-medium">Agregar un distrito al delivery</p>
        <DistrictSearch id="nuevo-distrito" value={adding} onChange={setAdding} />
        {adding ? (
          <button
            type="button"
            onClick={() => {
              const [name, rest] = adding.label.split(", ");
              if (!rows.some((r) => r.ubigeo === adding.ubigeo)) {
                setRows((rs) => [...rs, { ubigeo: adding.ubigeo, name, province: rest?.split(" - ")[0] ?? "", deliveryPriceCents: null, price: "" }]);
                setRemoved((xs) => xs.filter((x) => x !== adding.ubigeo));
                setDirty(true);
              }
              setAdding(null);
            }}
            className={cn(buttonClass("secondary", "sm"), "mt-3")}
          >
            Agregar {adding.label.split(",")[0]}
          </button>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={save} disabled={pending || !dirty} className={buttonClass("primary")}>
          {pending ? "Guardando…" : "Guardar precios"}
        </button>
        {dirty ? <span className="text-sm text-warning">Cambios sin guardar.</span> : null}
        <FormAlert state={state} />
      </div>
    </div>
  );
}
