"use client";

import { Search, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Combobox } from "@/components/admin/combobox";
import { buttonClass } from "@/components/admin/ui";
import { ColorSwatch } from "@/components/ui/color-swatch";
import { Field, fieldClass, inputClass, inputCompactClass, selectClass, SelectWrap } from "@/components/ui/form";
import { cn } from "@/lib/cn";
import { formatPrice } from "@/lib/money";
import { DOCUMENT_LABEL } from "@/lib/order-status";
import type { PosVariant } from "@/server/services/pos";
import { findCustomerAction, lookupRucAction } from "../pos/actions";
import { saveQuoteAction } from "./actions";

type DocType = keyof typeof DOCUMENT_LABEL;
type Line = { variantId: string; quantity: string; price: string };
export type QuoteFormInitial = {
  id: string;
  warehouseId: string;
  customer: { documentType: DocType | null; documentNumber: string | null; name: string; phone: string | null; email: string | null; address: string | null };
  validDays: number;
  note: string | null;
  lines: { variantId: string; quantity: number; unitPriceCents: number }[];
};

const soles = (cents: number) => String(cents / 100);
const toCents = (value: string) => {
  const n = Number(value.replace(",", ".").replace(/[^\d.]/g, ""));
  return value.trim() && Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null;
};
const VALIDITY = [3, 7, 15, 30];

/**
 * Cotización para mayoristas: el cliente, las prendas (se elige el modelo y se ponen cantidades por color y talla) y
 * el precio por unidad, que se puede poner de una vez para todo el modelo. No reserva stock.
 */
export function QuoteForm({ warehouse, variants, initial }: { warehouse: { id: string; name: string }; variants: PosVariant[]; initial?: QuoteFormInitial }) {
  const router = useRouter();
  const [customer, setCustomer] = useState({
    documentType: (initial?.customer.documentType ?? "ruc") as DocType,
    documentNumber: initial?.customer.documentNumber ?? "",
    name: initial?.customer.name ?? "",
    phone: initial?.customer.phone ?? "",
    email: initial?.customer.email ?? "",
    address: initial?.customer.address ?? "",
  });
  const [lines, setLines] = useState<Line[]>(() => initial?.lines.map((l) => ({ variantId: l.variantId, quantity: String(l.quantity), price: soles(l.unitPriceCents) })) ?? []);
  const [validDays, setValidDays] = useState(initial?.validDays ?? 7);
  const [note, setNote] = useState(initial?.note ?? "");
  const [query, setQuery] = useState("");
  const [chooser, setChooser] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const { byId, products, options } = useMemo(() => {
    const groups = new Map<string, PosVariant[]>();
    for (const v of variants) groups.set(v.productId, [...(groups.get(v.productId) ?? []), v]);
    return {
      byId: new Map(variants.map((v) => [v.variantId, v])),
      products: groups,
      options: [...groups.values()].map((vs) => ({ value: vs[0].productName })),
    };
  }, [variants]);
  const byName = useMemo(() => new Map([...products.values()].map((vs) => [vs[0].productName, vs[0].productId])), [products]);

  const priced = lines.map((l) => {
    const v = byId.get(l.variantId);
    const quantity = Math.max(0, Math.floor(Number(l.quantity) || 0));
    const unit = toCents(l.price);
    return { ...l, v, quantity, unit, total: unit ? unit * quantity : 0, list: v ? v.priceCents * quantity : 0 };
  });
  const totalCents = priced.reduce((s, l) => s + l.total, 0);
  const listCents = priced.reduce((s, l) => s + l.list, 0);
  const units = priced.reduce((s, l) => s + l.quantity, 0);
  const grouped = [...new Set(priced.map((l) => l.v?.productId ?? ""))].map((productId) => ({ productId, lines: priced.filter((l) => (l.v?.productId ?? "") === productId) }));

  const update = (variantId: string, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.variantId === variantId ? { ...l, ...patch } : l)));
  const setModelPrice = (productId: string, price: string) => setLines((ls) => ls.map((l) => (byId.get(l.variantId)?.productId === productId ? { ...l, price } : l)));
  const addQuantities = (quantities: Record<string, number>) => {
    setLines((ls) => {
      const next = ls.map((l) => ({ ...l }));
      for (const [variantId, qty] of Object.entries(quantities)) {
        if (qty <= 0) continue;
        const v = byId.get(variantId)!;
        const same = next.find((l) => l.variantId === variantId);
        // Si el modelo ya tiene precio mayorista, la talla nueva entra con ese precio.
        const modelPrice = next.find((l) => byId.get(l.variantId)?.productId === v.productId)?.price;
        if (same) same.quantity = String((Number(same.quantity) || 0) + qty);
        else next.push({ variantId, quantity: String(qty), price: modelPrice ?? soles(v.priceCents) });
      }
      return next;
    });
    setChooser(null);
  };

  const lookup = () =>
    start(async () => {
      const doc = customer.documentNumber.trim();
      if (customer.documentType === "ruc" && /^\d{11}$/.test(doc)) {
        const found = await lookupRucAction(doc);
        if (found) setCustomer((c) => ({ ...c, name: found.name, address: found.address ?? c.address }));
        else setError("No encontramos ese RUC: escribe la razón social.");
        return;
      }
      const found = await findCustomerAction(doc);
      if (found?.name) setCustomer((c) => ({ ...c, name: found.name ?? c.name, documentType: found.documentType ?? c.documentType }));
    });

  const save = () =>
    start(async () => {
      setError(null);
      const result = await saveQuoteAction(
        {
          warehouseId: warehouse.id,
          customer: { ...customer, documentType: customer.documentNumber.trim() ? customer.documentType : null },
          validDays,
          note,
          lines: priced.map((l) => ({ variantId: l.variantId, quantity: l.quantity, unitPriceCents: l.unit ?? 0 })),
        },
        initial?.id,
      );
      if (!result.ok) return setError(result.message);
      router.push(`/admin/cotizaciones/${result.number}`);
    });

  const chosen = chooser ? products.get(chooser) : null;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="min-w-0 space-y-4">
        <section className="space-y-3 rounded-2xl border border-line bg-surface p-4">
          <h2 className="font-semibold">Prendas</h2>
          <Combobox
            options={options}
            value={query}
            onChange={setQuery}
            onPick={(name) => {
              setQuery("");
              const id = byName.get(name);
              if (id) setChooser(id);
            }}
            label="Buscar modelo"
            placeholder="Busca el modelo (Baggy, Polo Boxy…)"
            className={cn(fieldClass, "h-12 w-full bg-raised px-4 text-base")}
          />
          {chosen ? <QuantityGrid key={chooser} variants={chosen} onAdd={addQuantities} onClose={() => setChooser(null)} warehouseName={warehouse.name} /> : null}
          {grouped.length ? (
            <div className="space-y-4">
              {grouped.map((g) => {
                const first = g.lines[0].v;
                const prices = new Set(g.lines.map((l) => l.price));
                return (
                  <div key={g.productId} className="rounded-xl border border-line">
                    <div className="flex flex-wrap items-center gap-3 border-b border-line px-3 py-2.5">
                      <span className="min-w-0 flex-1 font-semibold">{first?.productName ?? "Prenda que ya no existe"}</span>
                      <label className="flex items-center gap-2 text-sm">
                        <span className="text-muted">Precio c/u para todo el modelo S/</span>
                        <input
                          inputMode="decimal"
                          value={prices.size === 1 ? g.lines[0].price : ""}
                          placeholder="—"
                          onChange={(e) => setModelPrice(g.productId, e.target.value)}
                          className={cn(fieldClass, "h-10 w-24 bg-raised px-3 text-base tabular-nums pointer-fine:text-sm")}
                        />
                      </label>
                    </div>
                    <ul className="divide-y divide-line">
                      {g.lines.map((l) => (
                        <li key={l.variantId} className="flex flex-wrap items-center gap-3 px-3 py-2">
                          <span className="min-w-[10rem] flex-1 text-sm">
                            <span className="inline-flex items-center gap-1.5">
                              {l.v?.colorHex ? <ColorSwatch hex={l.v.colorHex} className="size-3" /> : null}
                              {l.v?.colorName} · Talla {l.v?.sizeLabel}
                            </span>
                            <span className="block font-mono text-xs text-subtle">
                              {l.v?.sku} · lista {l.v ? formatPrice(l.v.priceCents) : "—"} · {l.v?.stock ?? 0} en {warehouse.name}
                            </span>
                          </span>
                          <label className="flex items-center gap-1.5 text-xs text-muted">
                            Cant.
                            <input inputMode="numeric" value={l.quantity} onChange={(e) => update(l.variantId, { quantity: e.target.value.replace(/\D/g, "") })} className={cn(fieldClass, "h-11 w-20 bg-raised px-2 text-center text-base tabular-nums pointer-fine:text-sm")} />
                          </label>
                          <label className="flex items-center gap-1.5 text-xs text-muted">
                            S/ c/u
                            <input inputMode="decimal" value={l.price} onChange={(e) => update(l.variantId, { price: e.target.value })} className={cn(fieldClass, "h-11 w-24 bg-raised px-3 text-base tabular-nums pointer-fine:text-sm")} />
                          </label>
                          <span className="w-24 text-right text-sm font-semibold tabular-nums">{formatPrice(l.total)}</span>
                          <button type="button" aria-label={`Quitar ${l.v?.sku ?? "la prenda"}`} onClick={() => setLines((ls) => ls.filter((x) => x.variantId !== l.variantId))} className="grid size-10 place-items-center text-subtle hover:text-danger">
                            <Trash2 className="size-4" aria-hidden />
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="rounded-xl border border-dashed border-line px-4 py-8 text-center text-sm text-muted">Busca un modelo y pon cuántas prendas de cada color y talla.</p>
          )}
        </section>
      </div>

      <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
        <section className="space-y-3 rounded-2xl border border-line bg-surface p-4">
          <h2 className="font-semibold">Cliente</h2>
          <div className="flex gap-2">
            <SelectWrap>
              <select aria-label="Tipo de documento" value={customer.documentType} onChange={(e) => setCustomer((c) => ({ ...c, documentType: e.target.value as DocType }))} className={cn(selectClass, "h-11 w-28 text-sm")}>
                {Object.entries(DOCUMENT_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </SelectWrap>
            <input
              aria-label="Número de documento"
              inputMode="numeric"
              value={customer.documentNumber}
              onChange={(e) => setCustomer((c) => ({ ...c, documentNumber: e.target.value }))}
              placeholder="RUC o DNI"
              className={cn(inputCompactClass, "min-w-0 flex-1")}
            />
            <button type="button" aria-label="Buscar el nombre" disabled={pending || customer.documentNumber.trim().length < 8} onClick={lookup} className={cn(buttonClass("secondary", "sm"), "h-11 w-11 px-0")}>
              <Search className="size-4" aria-hidden />
            </button>
          </div>
          <input aria-label="Nombre o razón social" value={customer.name} onChange={(e) => setCustomer((c) => ({ ...c, name: e.target.value }))} placeholder="Nombre o razón social" className={inputCompactClass} />
          <div className="flex gap-2">
            <input aria-label="Celular" inputMode="tel" value={customer.phone} onChange={(e) => setCustomer((c) => ({ ...c, phone: e.target.value }))} placeholder="Celular" className={cn(inputCompactClass, "min-w-0 flex-1")} />
            <input aria-label="Correo" inputMode="email" value={customer.email} onChange={(e) => setCustomer((c) => ({ ...c, email: e.target.value }))} placeholder="Correo" className={cn(inputCompactClass, "min-w-0 flex-1")} />
          </div>
          <input aria-label="Dirección" value={customer.address} onChange={(e) => setCustomer((c) => ({ ...c, address: e.target.value }))} placeholder="Dirección (opcional)" className={inputCompactClass} />
        </section>

        <section className="space-y-3 rounded-2xl border border-line bg-surface p-4">
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted">
                {units} {units === 1 ? "prenda" : "prendas"} a precio de lista
              </dt>
              <dd className="tabular-nums">{formatPrice(listCents)}</dd>
            </div>
            {listCents > totalCents ? (
              <div className="flex justify-between">
                <dt className="text-muted">Descuento mayorista</dt>
                <dd className="text-success tabular-nums">−{formatPrice(listCents - totalCents)}</dd>
              </div>
            ) : null}
          </dl>
          <div className="flex items-baseline justify-between border-t border-line pt-3">
            <span className="font-bold">Total</span>
            <span className="text-3xl font-extrabold tabular-nums">{formatPrice(totalCents)}</span>
          </div>
          <Field label="Válida por">
            {(a11y) => (
              <SelectWrap>
                <select {...a11y} value={validDays} onChange={(e) => setValidDays(Number(e.target.value))} className={selectClass}>
                  {[...new Set([...VALIDITY, validDays])].sort((a, b) => a - b).map((d) => (
                    <option key={d} value={d}>
                      {d} días
                    </option>
                  ))}
                </select>
              </SelectWrap>
            )}
          </Field>
          <Field label="Condiciones" optional>
            {(a11y) => (
              <textarea {...a11y} value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="Ej. 50 % de adelanto, entrega en 5 días, recojo en tienda" className={cn(inputClass, "h-auto py-3")} />
            )}
          </Field>
          {error ? (
            <p role="alert" className="rounded-xl bg-danger/15 px-4 py-3 text-sm text-danger">
              {error}
            </p>
          ) : null}
          <button type="button" onClick={save} disabled={pending || !lines.length} className={cn(buttonClass("primary"), "h-12 w-full")}>
            {pending ? "Guardando…" : initial ? "Guardar cambios" : "Guardar cotización"}
          </button>
        </section>
      </aside>
    </div>
  );
}

/** Cantidades por color y talla de un modelo (con el stock de la tienda de referencia: no se reserva). */
function QuantityGrid({ variants, onAdd, onClose, warehouseName }: { variants: PosVariant[]; onAdd: (q: Record<string, number>) => void; onClose: () => void; warehouseName: string }) {
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const colors = [...new Set(variants.map((v) => v.colorName))];
  const parsed = Object.fromEntries(Object.entries(quantities).map(([k, v]) => [k, Math.max(0, Math.floor(Number(v) || 0))]));
  const total = Object.values(parsed).reduce((s, n) => s + n, 0);
  return (
    <div className="space-y-3 rounded-xl border border-white/40 p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="font-semibold">{variants[0].productName}</p>
        <button type="button" aria-label="Cerrar" onClick={onClose} className={buttonClass("ghost", "sm")}>
          <X className="size-4" aria-hidden />
        </button>
      </div>
      {colors.map((color) => (
        <div key={color}>
          <p className="mb-1.5 text-xs text-muted uppercase">{color}</p>
          <div className="flex flex-wrap gap-2">
            {variants
              .filter((v) => v.colorName === color)
              .map((v) => (
                <label key={v.variantId} className="flex w-20 flex-col items-center gap-1 rounded-xl border border-line bg-raised p-2">
                  <span className="text-lg leading-none font-extrabold">{v.sizeLabel}</span>
                  <input
                    inputMode="numeric"
                    aria-label={`Cantidad de ${color} talla ${v.sizeLabel}`}
                    value={quantities[v.variantId] ?? ""}
                    placeholder="0"
                    onChange={(e) => setQuantities((q) => ({ ...q, [v.variantId]: e.target.value.replace(/\D/g, "") }))}
                    className="h-9 w-full rounded-lg border border-line bg-surface text-center font-bold tabular-nums outline-none focus:border-white"
                  />
                  <span className="text-[10px] text-subtle">{v.stock} en tienda</span>
                </label>
              ))}
          </div>
        </div>
      ))}
      <p className="text-xs text-subtle">Stock de {warehouseName}: la cotización no lo reserva.</p>
      <button type="button" disabled={!total} onClick={() => onAdd(parsed)} className={buttonClass("primary", "sm")}>
        {total ? `Agregar ${total} ${total === 1 ? "prenda" : "prendas"}` : "Pon las cantidades"}
      </button>
    </div>
  );
}
