"use client";

import { Minus, Plus } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { FormAlert } from "@/components/admin/form-controls";
import { buttonClass } from "@/components/admin/ui";
import { cn } from "@/lib/cn";
import { idle, type ActionState } from "../../_lib/action-state";
import { saveInventoryAction } from "./actions";

export type InventoryRow = {
  variantId: string;
  sku: string;
  productId: string;
  productName: string;
  colorName: string;
  sizeLabel: string;
  stock: number;
  priceCents: number;
  compareAtPriceCents: number | null;
  isActive: boolean;
};

type Draft = { stock: number; price: string; compareAt: string };
const soles = (cents: number | null) => (cents ? String(cents / 100) : "");
const cents = (value: string) => {
  const n = Number(value.replace(",", "."));
  return value.trim() && Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null;
};

export function InventoryEditor({ rows }: { rows: InventoryRow[] }) {
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [state, setState] = useState<ActionState>(idle);
  const [pending, startTransition] = useTransition();

  const value = (r: InventoryRow): Draft => drafts[r.variantId] ?? { stock: r.stock, price: soles(r.priceCents), compareAt: soles(r.compareAtPriceCents) };
  const changed = rows.filter((r) => {
    const d = drafts[r.variantId];
    return d && (d.stock !== r.stock || cents(d.price) !== r.priceCents || cents(d.compareAt) !== (r.compareAtPriceCents ?? null));
  });
  const set = (r: InventoryRow, patch: Partial<Draft>) => setDrafts((ds) => ({ ...ds, [r.variantId]: { ...value(r), ...patch } }));

  const save = () =>
    startTransition(async () => {
      const updates = changed.map((r) => {
        const d = value(r);
        return { variantId: r.variantId, stock: d.stock, priceCents: cents(d.price) ?? r.priceCents, compareAtPriceCents: cents(d.compareAt) };
      });
      const result = await saveInventoryAction(updates);
      setState(result);
      if (result.status === "success") setDrafts({});
    });

  return (
    <div className="pb-24">
      <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line">
        {rows.map((r, i) => {
          const d = value(r);
          const isChanged = changed.includes(r);
          const showProduct = i === 0 || rows[i - 1].productId !== r.productId;
          return (
            <li key={r.variantId} className={cn("px-4 py-3", isChanged && "bg-warning/5", !r.isActive && "opacity-60")}>
              {showProduct ? (
                <Link href={`/admin/productos/${r.productId}`} className="mb-2 block text-sm font-semibold hover:underline">
                  {r.productName}
                </Link>
              ) : null}
              <div className="flex flex-wrap items-center gap-3">
                <span className="min-w-[9rem] flex-1 text-sm">
                  {r.colorName} · Talla {r.sizeLabel}
                  <span className="block font-mono text-xs text-subtle">
                    {r.sku}
                    {r.isActive ? "" : " · inactiva"}
                  </span>
                </span>
                <div className={cn("flex h-10 items-center rounded-xl border bg-raised", d.stock === 0 ? "border-danger/50" : "border-line")}>
                  <button type="button" aria-label="Menos" onClick={() => set(r, { stock: Math.max(0, d.stock - 1) })} className="grid h-full w-9 place-items-center">
                    <Minus className="size-4" aria-hidden />
                  </button>
                  <input
                    type="number"
                    min={0}
                    inputMode="numeric"
                    aria-label={`Stock ${r.sku}`}
                    value={d.stock}
                    onChange={(e) => set(r, { stock: Math.max(0, Number(e.target.value) || 0) })}
                    className="h-full w-12 bg-transparent text-center tabular-nums outline-none"
                  />
                  <button type="button" aria-label="Más" onClick={() => set(r, { stock: d.stock + 1 })} className="grid h-full w-9 place-items-center">
                    <Plus className="size-4" aria-hidden />
                  </button>
                </div>
                <label className="flex h-10 items-center gap-1 rounded-xl border border-line bg-raised px-3 text-sm">
                  <span className="text-muted">S/</span>
                  <input
                    inputMode="decimal"
                    aria-label={`Precio ${r.sku}`}
                    value={d.price}
                    onChange={(e) => set(r, { price: e.target.value })}
                    className="w-14 bg-transparent tabular-nums outline-none"
                  />
                </label>
                <label className="hidden h-10 items-center gap-1 rounded-xl border border-line bg-raised px-3 text-sm sm:flex" title="Precio antes (tachado)">
                  <span className="text-muted">Antes</span>
                  <input
                    inputMode="decimal"
                    aria-label={`Precio antes ${r.sku}`}
                    value={d.compareAt}
                    placeholder="—"
                    onChange={(e) => set(r, { compareAt: e.target.value })}
                    className="w-12 bg-transparent tabular-nums outline-none"
                  />
                </label>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-ink/95 px-4 pt-3 backdrop-blur-md pb-safe lg:left-64">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3">
          <button type="button" onClick={save} disabled={pending || changed.length === 0} className={buttonClass("primary")}>
            {pending ? "Guardando…" : changed.length ? `Guardar ${changed.length} ${changed.length === 1 ? "cambio" : "cambios"}` : "Sin cambios"}
          </button>
          {changed.length ? (
            <button type="button" onClick={() => setDrafts({})} className={buttonClass("ghost", "sm")}>
              Deshacer
            </button>
          ) : null}
          <FormAlert state={state} />
        </div>
      </div>
    </div>
  );
}
