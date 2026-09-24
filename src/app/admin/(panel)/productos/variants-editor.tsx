"use client";

import { Minus, Plus, Trash2, Wand2 } from "lucide-react";
import { useId, useState, useTransition } from "react";
import { FormAlert } from "@/components/admin/form-controls";
import { buttonClass } from "@/components/admin/ui";
import { inputClass } from "@/components/ui/form";
import { cn } from "@/lib/cn";
import { compareSizes } from "@/lib/sizes";
import { slugify } from "@/lib/slug";
import { idle, type ActionState } from "../../_lib/action-state";
import { saveVariantsAction } from "./actions";

export type EditableVariant = {
  id?: string;
  color: string;
  size: string;
  sku: string;
  priceCents: number;
  compareAtPriceCents: number | null;
  stock: number;
  isActive: boolean;
};

type Row = Omit<EditableVariant, "priceCents" | "compareAtPriceCents"> & { key: string; price: string; compareAt: string };

const COMMON_SIZES = ["XS", "S", "M", "L", "XL", "28", "30", "32", "34", "36"];
const toSoles = (cents: number | null) => (cents ? String(cents / 100) : "");
const toCents = (value: string) => {
  const n = Number(value.replace(",", ".").replace(/[^\d.]/g, ""));
  return value.trim() && Number.isFinite(n) ? Math.round(n * 100) : null;
};
let seq = 0;
const newKey = () => `n${++seq}`;

type VariantsEditorProps = { productId: string; initial: EditableVariant[]; colorNames: string[]; sizeLabels: string[] };

export function VariantsEditor({ productId, initial, colorNames, sizeLabels }: VariantsEditorProps) {
  const listId = useId();
  const [rows, setRows] = useState<Row[]>(() =>
    initial.map((v) => ({ ...v, key: v.id ?? newKey(), price: toSoles(v.priceCents), compareAt: toSoles(v.compareAtPriceCents) })),
  );
  const [dirty, setDirty] = useState(false);
  const [state, setState] = useState<ActionState>(idle);
  const [pending, startTransition] = useTransition();
  const [generatorOpen, setGeneratorOpen] = useState(initial.length === 0);

  const update = (key: string, patch: Partial<Row>) => {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
    setDirty(true);
  };
  const remove = (key: string) => {
    setRows((rs) => rs.filter((r) => r.key !== key));
    setDirty(true);
  };
  const last = rows.at(-1);
  const addRow = () => {
    setRows((rs) => [
      ...rs,
      { key: newKey(), color: last?.color ?? "", size: "", sku: "", price: last?.price ?? "", compareAt: last?.compareAt ?? "", stock: 0, isActive: true },
    ]);
    setDirty(true);
  };

  const save = () =>
    startTransition(async () => {
      const payload = rows.map((r) => ({
        id: r.id,
        color: r.color,
        size: r.size,
        sku: r.sku,
        priceCents: toCents(r.price) ?? 0,
        compareAtPriceCents: toCents(r.compareAt),
        stock: Math.max(0, Math.floor(r.stock)),
        isActive: r.isActive,
      }));
      const result = await saveVariantsAction(productId, payload);
      setState(result);
      if (result.status === "success") setDirty(false);
    });

  const totalStock = rows.reduce((s, r) => s + (r.isActive ? r.stock : 0), 0);
  const sizesDatalist = [...new Set([...COMMON_SIZES, ...sizeLabels])].sort(compareSizes);

  return (
    <div className="space-y-4">
      <datalist id={`${listId}-colors`}>
        {colorNames.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      <datalist id={`${listId}-sizes`}>
        {sizesDatalist.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setGeneratorOpen((o) => !o)} className={buttonClass("secondary", "sm")}>
          <Wand2 className="size-4" aria-hidden /> Generar combinaciones
        </button>
        <button type="button" onClick={addRow} className={buttonClass("secondary", "sm")}>
          <Plus className="size-4" aria-hidden /> Agregar una
        </button>
        <span className="ml-auto text-sm text-muted">
          {rows.length} {rows.length === 1 ? "variante" : "variantes"} · {totalStock} en stock
        </span>
      </div>

      {generatorOpen ? (
        <Generator
          sizes={sizesDatalist}
          colorsListId={`${listId}-colors`}
          onGenerate={(combos) => {
            setRows((rs) => {
              const existing = new Set(rs.map((r) => `${slugify(r.color)}|${r.size.toUpperCase()}`));
              const fresh = combos
                .filter((c) => !existing.has(`${slugify(c.color)}|${c.size.toUpperCase()}`))
                .map((c) => ({ key: newKey(), sku: "", isActive: true, ...c }));
              return [...rs, ...fresh];
            });
            setDirty(true);
            setGeneratorOpen(false);
          }}
        />
      ) : null}

      {rows.length ? (
        <>
          <div className="hidden grid-cols-[1.3fr_0.7fr_1fr_0.8fr_0.8fr_1.1fr_auto_auto] gap-2 px-1 text-xs text-muted lg:grid">
            <span>Color</span>
            <span>Talla</span>
            <span>SKU</span>
            <span>Precio S/</span>
            <span>Antes S/</span>
            <span>Stock</span>
            <span>Activa</span>
            <span className="sr-only">Quitar</span>
          </div>
          <ul className="space-y-2">
            {rows.map((r) => (
              <li
                key={r.key}
                className={cn(
                  "grid grid-cols-2 gap-2 rounded-xl border border-line p-3 lg:grid-cols-[1.3fr_0.7fr_1fr_0.8fr_0.8fr_1.1fr_auto_auto] lg:items-center lg:border-0 lg:p-1",
                  !r.isActive && "opacity-60",
                )}
              >
                <Input label="Color" list={`${listId}-colors`} value={r.color} onChange={(v) => update(r.key, { color: v })} className="col-span-2 lg:col-span-1" />
                <Input label="Talla" list={`${listId}-sizes`} value={r.size} onChange={(v) => update(r.key, { size: v.toUpperCase() })} />
                <Input label="SKU" value={r.sku} placeholder="Automático" onChange={(v) => update(r.key, { sku: v.toUpperCase() })} mono />
                <Input label="Precio S/" value={r.price} inputMode="decimal" onChange={(v) => update(r.key, { price: v })} />
                <Input label="Antes S/" value={r.compareAt} inputMode="decimal" placeholder="—" onChange={(v) => update(r.key, { compareAt: v })} />
                <div className="col-span-2 lg:col-span-1">
                  <span className="mb-1 block text-xs text-muted lg:sr-only">Stock</span>
                  <div className="flex h-11 items-center rounded-xl border border-line bg-raised">
                    <button type="button" aria-label="Menos" onClick={() => update(r.key, { stock: Math.max(0, r.stock - 1) })} className="grid h-full w-10 place-items-center">
                      <Minus className="size-4" aria-hidden />
                    </button>
                    <input
                      type="number"
                      min={0}
                      inputMode="numeric"
                      value={r.stock}
                      onChange={(e) => update(r.key, { stock: Math.max(0, Number(e.target.value) || 0) })}
                      aria-label="Stock"
                      className="h-full min-w-0 flex-1 bg-transparent text-center tabular-nums outline-none"
                    />
                    <button type="button" aria-label="Más" onClick={() => update(r.key, { stock: r.stock + 1 })} className="grid h-full w-10 place-items-center">
                      <Plus className="size-4" aria-hidden />
                    </button>
                  </div>
                </div>
                <label className="flex items-center gap-2 text-sm lg:justify-center">
                  <input type="checkbox" checked={r.isActive} onChange={(e) => update(r.key, { isActive: e.target.checked })} className="size-5 accent-white" />
                  <span className="lg:sr-only">Activa</span>
                </label>
                <button type="button" onClick={() => remove(r.key)} aria-label={`Quitar ${r.color} ${r.size}`} className="grid size-11 place-items-center justify-self-end text-subtle hover:text-danger">
                  <Trash2 className="size-4" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
          <BulkPrice
            onApply={(price, compareAt) => {
              setRows((rs) => rs.map((r) => ({ ...r, price, compareAt })));
              setDirty(true);
            }}
          />
        </>
      ) : (
        <p className="rounded-xl border border-dashed border-line px-4 py-8 text-center text-sm text-muted">Sin variantes. Usa “Generar combinaciones” para crear colores × tallas de una vez.</p>
      )}

      <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
        <button type="button" onClick={save} disabled={pending || !dirty} className={buttonClass("primary")}>
          {pending ? "Guardando…" : "Guardar variantes"}
        </button>
        {dirty && !pending ? <span className="text-sm text-warning">Tienes cambios sin guardar.</span> : null}
        <FormAlert state={state} />
      </div>
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  list,
  placeholder,
  inputMode,
  mono,
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  list?: string;
  placeholder?: string;
  inputMode?: "decimal" | "numeric";
  mono?: boolean;
  className?: string;
}) {
  return (
    <label className={cn("block min-w-0", className)}>
      <span className="mb-1 block text-xs text-muted lg:sr-only">{label}</span>
      <input
        value={value}
        list={list}
        placeholder={placeholder}
        inputMode={inputMode}
        onChange={(e) => onChange(e.target.value)}
        className={cn(inputClass, "h-11 px-3 text-sm", mono && "font-mono")}
      />
    </label>
  );
}

function Generator({ sizes, colorsListId, onGenerate }: { sizes: string[]; colorsListId: string; onGenerate: (rows: Omit<Row, "key" | "sku" | "isActive">[]) => void }) {
  const [colors, setColors] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [price, setPrice] = useState("");
  const [compareAt, setCompareAt] = useState("");
  const [stock, setStock] = useState("0");
  const colorList = colors
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
  const count = colorList.length * selected.length;

  return (
    <div className="space-y-4 rounded-xl bg-raised p-4">
      <p className="text-sm font-medium">Crea todas las combinaciones de colores × tallas de una vez.</p>
      <label className="block">
        <span className="mb-1.5 block text-sm">Colores (separados por coma)</span>
        <input value={colors} onChange={(e) => setColors(e.target.value)} list={colorsListId} placeholder="Negro, Blanco, Beige" className={cn(inputClass, "bg-ink")} />
      </label>
      <div>
        <span className="mb-1.5 block text-sm">Tallas</span>
        <div className="flex flex-wrap gap-2">
          {sizes.map((s) => {
            const on = selected.includes(s);
            return (
              <button
                key={s}
                type="button"
                aria-pressed={on}
                onClick={() => setSelected((x) => (on ? x.filter((y) => y !== s) : [...x, s]))}
                className={cn("h-10 min-w-12 rounded-lg border px-3 text-sm font-semibold", on ? "border-white bg-white text-black" : "border-line")}
              >
                {s}
              </button>
            );
          })}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <label>
          <span className="mb-1.5 block text-sm">Precio S/</span>
          <input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" className={cn(inputClass, "bg-ink")} />
        </label>
        <label>
          <span className="mb-1.5 block text-sm">Antes S/</span>
          <input value={compareAt} onChange={(e) => setCompareAt(e.target.value)} inputMode="decimal" placeholder="—" className={cn(inputClass, "bg-ink")} />
        </label>
        <label>
          <span className="mb-1.5 block text-sm">Stock c/u</span>
          <input value={stock} onChange={(e) => setStock(e.target.value)} inputMode="numeric" className={cn(inputClass, "bg-ink")} />
        </label>
      </div>
      <button
        type="button"
        disabled={count === 0 || !toCents(price)}
        onClick={() =>
          onGenerate(
            colorList.flatMap((color) =>
              [...selected].sort(compareSizes).map((size) => ({ color, size, price, compareAt, stock: Math.max(0, Number(stock) || 0) })),
            ),
          )
        }
        className={buttonClass("primary", "sm")}
      >
        {count ? `Agregar ${count} ${count === 1 ? "variante" : "variantes"}` : "Elige colores y tallas"}
      </button>
    </div>
  );
}

function BulkPrice({ onApply }: { onApply: (price: string, compareAt: string) => void }) {
  const [price, setPrice] = useState("");
  const [compareAt, setCompareAt] = useState("");
  return (
    <details className="rounded-xl border border-line">
      <summary className="cursor-pointer list-none px-4 py-3 text-sm">Poner el mismo precio a todas</summary>
      <div className="flex flex-wrap items-end gap-2 border-t border-line p-4">
        <label>
          <span className="mb-1 block text-xs text-muted">Precio S/</span>
          <input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" className={cn(inputClass, "h-11 w-28")} />
        </label>
        <label>
          <span className="mb-1 block text-xs text-muted">Antes S/</span>
          <input value={compareAt} onChange={(e) => setCompareAt(e.target.value)} inputMode="decimal" placeholder="—" className={cn(inputClass, "h-11 w-28")} />
        </label>
        <button type="button" disabled={!toCents(price)} onClick={() => onApply(price, compareAt)} className={buttonClass("secondary", "sm")}>
          Aplicar a todas
        </button>
      </div>
    </details>
  );
}
