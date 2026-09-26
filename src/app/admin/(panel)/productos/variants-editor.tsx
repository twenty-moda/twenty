"use client";

import { CheckCircle2, CircleAlert, Minus, Plus, Trash2, Wand2 } from "lucide-react";
import { useState, useTransition, type ReactNode } from "react";
import { Combobox, type ComboOption } from "@/components/admin/combobox";
import { FormAlert } from "@/components/admin/form-controls";
import { buttonClass } from "@/components/admin/ui";
import { Chip } from "@/components/catalog/chip";
import { fieldClass, inputCompactClass } from "@/components/ui/form";
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
type Combo = { color: string; size: string };
type ComboValues = Pick<Row, "price" | "compareAt" | "stock">;

const COMMON_SIZES = ["XS", "S", "M", "L", "XL", "28", "30", "32", "34", "36"];
const toSoles = (cents: number | null) => (cents ? String(cents / 100) : "");
const toCents = (value: string) => {
  const n = Number(value.replace(",", ".").replace(/[^\d.]/g, ""));
  return value.trim() && Number.isFinite(n) ? Math.round(n * 100) : null;
};
let seq = 0;
const newKey = () => `n${++seq}`;
/** Misma regla que el servidor para saber si dos variantes son la misma combinación. */
const optionKey = (color: string, size: string) => `${slugify(color)}|${size.toUpperCase()}`;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const newColor = (v: string) => `Color nuevo: «${v}»`;
const newSize = (v: string) => `Talla nueva: «${v.toUpperCase()}»`;
// Encabezado y filas con la misma plantilla. Las dos últimas columnas tienen ancho fijo: con `auto`, el
// encabezado ("Activa") y las filas (casilla y tacho) las medían distinto y los títulos no calzaban.
const COLUMNS =
  "lg:grid-cols-[minmax(0,1.4fr)_minmax(0,0.7fr)_minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,1.1fr)_3.5rem_2.75rem]";
const inkInputClass = cn(fieldClass, "h-12 w-full bg-ink px-4 text-base");

type VariantsEditorProps = { productId: string; initial: EditableVariant[]; colors: ComboOption[]; sizeLabels: string[] };

export function VariantsEditor({ productId, initial, colors, sizeLabels }: VariantsEditorProps) {
  const [rows, setRows] = useState<Row[]>(() =>
    initial.map((v) => ({ ...v, key: v.id ?? newKey(), price: toSoles(v.priceCents), compareAt: toSoles(v.compareAtPriceCents) })),
  );
  const [dirty, setDirty] = useState(false);
  const [state, setState] = useState<ActionState>(idle);
  const [pending, startTransition] = useTransition();
  const [generatorOpen, setGeneratorOpen] = useState(initial.length === 0);
  // Lo que acaba de hacer el generador: se resaltan esas filas y se avisa que falta guardar.
  const [recent, setRecent] = useState<{ keys: Set<string>; message: string } | null>(null);

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
      if (result.status === "success") {
        setDirty(false);
        setRecent(null);
      }
    });

  const totalStock = rows.reduce((s, r) => s + (r.isActive ? r.stock : 0), 0);
  const sizes = [...new Set([...COMMON_SIZES, ...sizeLabels])].sort(compareSizes);
  const sizeOptions = sizes.map((value) => ({ value }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setGeneratorOpen((o) => !o);
            setRecent(null);
          }}
          className={buttonClass("secondary", "sm")}
        >
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
          sizes={sizes}
          colors={colors}
          productColors={rows.map((r) => r.color)}
          existing={new Set(rows.map((r) => optionKey(r.color, r.size)))}
          onAdd={(combos, values) => {
            const fresh = combos.map((c) => ({ key: newKey(), sku: "", isActive: true, ...c, ...values }));
            setRows((rs) => [...rs, ...fresh]);
            setDirty(true);
            setGeneratorOpen(false);
            setRecent({
              keys: new Set(fresh.map((r) => r.key)),
              message: `Agregaste ${plural(fresh.length, "variante", "variantes")} al final de la lista. Toca «Guardar variantes» para que queden.`,
            });
          }}
          onUpdate={(combos, values) => {
            const targets = new Set(combos.map((c) => optionKey(c.color, c.size)));
            const keys = new Set(rows.filter((r) => targets.has(optionKey(r.color, r.size))).map((r) => r.key));
            setRows((rs) => rs.map((r) => (keys.has(r.key) ? { ...r, ...values } : r)));
            setDirty(true);
            setGeneratorOpen(false);
            setRecent({
              keys,
              message: `Cambiaste el precio y el stock de ${plural(keys.size, "variante", "variantes")} (resaltadas abajo). Toca «Guardar variantes» para que queden.`,
            });
          }}
        />
      ) : null}

      {recent ? (
        <p role="status" className="flex items-start gap-2 rounded-xl bg-success/15 px-4 py-3 text-sm text-success animate-fade-in">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />
          {recent.message}
        </p>
      ) : null}

      {rows.length ? (
        <>
          <div aria-hidden className={cn("hidden gap-2 px-1 text-xs text-muted lg:grid", COLUMNS)}>
            <span className="px-3">Color</span>
            <span className="px-3">Talla</span>
            <span className="px-3">SKU</span>
            <span className="px-3">Precio S/</span>
            <span className="px-3">Antes S/</span>
            <span className="text-center">Stock</span>
            <span className="text-center">Activa</span>
            <span />
          </div>
          <ul className="space-y-2">
            {rows.map((r) => (
              <li
                key={r.key}
                className={cn(
                  "grid grid-cols-2 gap-2 rounded-xl border border-line p-3 lg:items-center lg:border-0 lg:p-1",
                  COLUMNS,
                  !r.isActive && "opacity-60",
                  recent?.keys.has(r.key) && "bg-success/10 ring-1 ring-success/40",
                )}
              >
                <Cell label="Color" className="col-span-2 lg:col-span-1">
                  <Combobox
                    label="Color"
                    options={colors}
                    value={r.color}
                    onChange={(v) => update(r.key, { color: v })}
                    swatches
                    createLabel={newColor}
                    className={inputCompactClass}
                  />
                </Cell>
                <Cell label="Talla">
                  <Combobox
                    label="Talla"
                    options={sizeOptions}
                    value={r.size}
                    onChange={(v) => update(r.key, { size: v.toUpperCase() })}
                    createLabel={newSize}
                    className={inputCompactClass}
                  />
                </Cell>
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

/** Celda con su título visible solo en el teléfono (en la computadora está el encabezado). */
function Cell({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <div className={cn("min-w-0", className)}>
      <span aria-hidden className="mb-1 block text-xs text-muted lg:hidden">
        {label}
      </span>
      {children}
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  placeholder,
  inputMode,
  mono,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  inputMode?: "decimal" | "numeric";
  mono?: boolean;
}) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-xs text-muted lg:sr-only">{label}</span>
      <input
        value={value}
        placeholder={placeholder}
        inputMode={inputMode}
        onChange={(e) => onChange(e.target.value)}
        className={cn(inputCompactClass, mono && "font-mono")}
      />
    </label>
  );
}

type GeneratorProps = {
  sizes: string[];
  /** Todos los colores del catálogo, para el buscador. */
  colors: ComboOption[];
  /** Los colores que ya tiene esta prenda: salen como botones, listos para tocar. */
  productColors: string[];
  /** `optionKey` de las variantes que ya están en la lista. */
  existing: Set<string>;
  onAdd: (combos: Combo[], values: ComboValues) => void;
  onUpdate: (combos: Combo[], values: ComboValues) => void;
};

const uniqueColors = (names: string[]) => names.map((c) => c.trim()).filter((c, i, all) => c && all.findIndex((o) => slugify(o) === slugify(c)) === i);

function Generator({ sizes, colors, productColors, existing, onAdd, onUpdate }: GeneratorProps) {
  // "Negro" y "negro" son un solo color (igual que en el servidor): queda como se escribió primero.
  const [choices, setChoices] = useState(() => uniqueColors(productColors));
  const [colorList, setColorList] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [price, setPrice] = useState("");
  const [compareAt, setCompareAt] = useState("");
  const [stock, setStock] = useState("0");
  const inCatalog = (name: string) => colors.find((c) => slugify(c.value) === slugify(name));
  const isOn = (name: string) => colorList.some((c) => slugify(c) === slugify(name));
  const toggleColor = (name: string) => setColorList((list) => (isOn(name) ? list.filter((c) => slugify(c) !== slugify(name)) : [...list, name]));
  const addColor = (name: string) => {
    const known = choices.find((c) => slugify(c) === slugify(name));
    if (!known) setChoices((list) => uniqueColors([...list, name]));
    if (!isOn(name)) setColorList((list) => [...list, known ?? name]);
    setSearch("");
  };
  const combos = colorList.flatMap((color) => [...selected].sort(compareSizes).map((size) => ({ color, size })));
  const fresh = combos.filter((c) => !existing.has(optionKey(c.color, c.size)));
  const repeated = combos.filter((c) => existing.has(optionKey(c.color, c.size)));
  const values = { price, compareAt, stock: Math.max(0, Number(stock) || 0) };
  const priceOk = !!toCents(price);

  return (
    <div className="space-y-4 rounded-xl bg-raised p-4">
      <p className="text-sm font-medium">Crea todas las combinaciones de colores × tallas de una vez.</p>
      <div>
        <span className="mb-1.5 block text-sm">Colores</span>
        {choices.length ? (
          <div className="mb-2 flex flex-wrap gap-2">
            {choices.map((c) => {
              const known = inCatalog(c);
              // Un color nuevo todavía no tiene punto (sin hex, el punto es el de los lavados de jean).
              return (
                <Chip key={slugify(c)} active={isOn(c)} swatch={known ? (known.hex ?? null) : undefined} onClick={() => toggleColor(c)}>
                  {c}
                </Chip>
              );
            })}
          </div>
        ) : null}
        <div className="sm:max-w-sm">
          <Combobox
            label={choices.length ? "Otro color" : "Color"}
            placeholder={choices.length ? "Otro color…" : "Busca o escribe un color"}
            options={colors.filter((o) => !choices.some((c) => slugify(c) === slugify(o.value)))}
            value={search}
            onChange={setSearch}
            onPick={addColor}
            swatches
            createLabel={(v) => `Agregar «${v}» (color nuevo)`}
            className={inkInputClass}
          />
        </div>
      </div>
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
          <input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" className={inkInputClass} />
        </label>
        <label>
          <span className="mb-1.5 block text-sm">Antes S/</span>
          <input value={compareAt} onChange={(e) => setCompareAt(e.target.value)} inputMode="decimal" placeholder="—" className={inkInputClass} />
        </label>
        <label>
          <span className="mb-1.5 block text-sm">Stock c/u</span>
          <input value={stock} onChange={(e) => setStock(e.target.value)} inputMode="numeric" className={inkInputClass} />
        </label>
      </div>
      {repeated.length ? (
        <div className="space-y-3 rounded-xl border border-line bg-ink p-3 text-sm">
          <p className="flex items-start gap-2">
            <CircleAlert className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
            <span>
              {repeated.length === 1 ? "Ya está en la lista (no se duplica): " : "Ya están en la lista (no se duplican): "}
              <strong className="font-semibold">{describeCombos(repeated)}</strong>.
            </span>
          </p>
          <button type="button" disabled={!priceOk} onClick={() => onUpdate(repeated, values)} className={buttonClass("secondary", "sm")}>
            {repeated.length === 1 ? "Ponerle" : "Ponerles"} este precio y stock
          </button>
        </div>
      ) : null}
      <button type="button" disabled={fresh.length === 0 || !priceOk} onClick={() => onAdd(fresh, values)} className={buttonClass("primary", "sm")}>
        {combos.length === 0
          ? "Elige colores y tallas"
          : fresh.length
            ? `Agregar ${plural(fresh.length, "variante", "variantes")}`
            : "No hay variantes nuevas"}
      </button>
    </div>
  );
}

const sizeList = new Intl.ListFormat("es", { type: "conjunction" });

/** "Negro S, M y L · Blanco XL" */
function describeCombos(combos: Combo[]) {
  const byColor = new Map<string, string[]>();
  for (const c of combos) byColor.set(c.color, [...(byColor.get(c.color) ?? []), c.size]);
  return [...byColor].map(([color, sizes]) => `${color} ${sizeList.format(sizes)}`).join(" · ");
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
          <input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" className={cn(fieldClass, "h-11 w-28 bg-raised px-3 text-base pointer-fine:text-sm")} />
        </label>
        <label>
          <span className="mb-1 block text-xs text-muted">Antes S/</span>
          <input value={compareAt} onChange={(e) => setCompareAt(e.target.value)} inputMode="decimal" placeholder="—" className={cn(fieldClass, "h-11 w-28 bg-raised px-3 text-base pointer-fine:text-sm")} />
        </label>
        <button type="button" disabled={!toCents(price)} onClick={() => onApply(price, compareAt)} className={buttonClass("secondary", "sm")}>
          Aplicar a todas
        </button>
      </div>
    </details>
  );
}
