"use client";

import { Printer, ScanBarcode, Trash2 } from "lucide-react";
import { memo, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Combobox } from "@/components/admin/combobox";
import { FormAlert } from "@/components/admin/form-controls";
import { buttonClass } from "@/components/admin/ui";
import { Field, inputCompactClass, selectClass, SelectWrap } from "@/components/ui/form";
import { failure, idle, type ActionState } from "@/lib/action-state";
import { cn } from "@/lib/cn";
import type { PickerVariant } from "@/server/services/inventory";
import { LABEL_FORMATS, LabelView as Label, type LabelFormat as FormatKey } from "./label-designs";

type Warehouse = { id: string; name: string };
type Line = { variantId: string; quantity: number };

const FORMATS = LABEL_FORMATS;
const PREVIEW_LIMIT = 48;
const variantLabel = (v: PickerVariant) => `${v.productName} · ${v.colorName} · ${v.sizeLabel} · ${v.sku}`;
const productLabel = (name: string) => `${name} (todas las tallas y colores)`;

/** Aparte y memorizada: escribir en el buscador no vuelve a dibujar los códigos de barras. */
const Preview = memo(function Preview({ labels, showPrice, format, fontClass }: { labels: PickerVariant[]; showPrice: boolean; format: FormatKey; fontClass: string }) {
  return (
    <section aria-label="Vista previa">
      <p className="mb-2 text-sm text-muted">Vista previa{labels.length > PREVIEW_LIMIT ? ` (las primeras ${PREVIEW_LIMIT} de ${labels.length})` : ""}</p>
      <div className={cn("flex flex-wrap gap-3 rounded-2xl bg-raised p-4", fontClass)}>
        {labels.slice(0, PREVIEW_LIMIT).map((v, i) => (
          <div key={i} className="rounded-sm shadow-md">
            <Label variant={v} showPrice={showPrice} format={format} />
          </div>
        ))}
      </div>
    </section>
  );
});

type LabelSheetProps = {
  variants: PickerVariant[];
  warehouses: Warehouse[];
  initialLines: Line[];
  initialWarehouseId?: string;
  /** Clases de next/font (Big Shoulders e IBM Plex Mono): la hoja de impresión vive fuera de la página y las necesita. */
  fontClass: string;
};

export function LabelSheet({ variants, warehouses, initialLines, initialWarehouseId, fontClass }: LabelSheetProps) {
  const [lines, setLines] = useState<Line[]>(initialLines);
  const [query, setQuery] = useState("");
  const [format, setFormat] = useState<FormatKey>("50x25");
  const [showPrice, setShowPrice] = useState(true);
  const [warehouseId, setWarehouseId] = useState(warehouses.find((w) => w.id === initialWarehouseId)?.id ?? warehouses[0]?.id ?? "");
  const [state, setState] = useState<ActionState>(idle);
  const [printing, setPrinting] = useState(false);

  // Se arman una vez: con el lector cada lectura es una ráfaga de teclas y la página no puede rehacerlas en cada una.
  const { byId, byLabel, bySku, products, options } = useMemo(() => {
    const groups = new Map<string, PickerVariant[]>();
    for (const v of variants) groups.set(productLabel(v.productName), [...(groups.get(productLabel(v.productName)) ?? []), v]);
    return {
      byId: new Map(variants.map((v) => [v.variantId, v])),
      byLabel: new Map(variants.map((v) => [variantLabel(v), v])),
      bySku: new Map(variants.map((v) => [v.sku.toUpperCase(), v])),
      products: groups,
      options: [...[...groups.keys()].map((value) => ({ value })), ...variants.map((v) => ({ value: variantLabel(v) }))],
    };
  }, [variants]);

  const labels = useMemo(() => lines.flatMap((l) => Array.from({ length: l.quantity }, () => byId.get(l.variantId)!)), [lines, byId]);
  const f = FORMATS[format];

  // Se arma la hoja de impresión recién al imprimir (pueden ser cientos de códigos) y se quita al terminar.
  useEffect(() => {
    if (!printing) return;
    const done = () => setPrinting(false);
    window.addEventListener("afterprint", done);
    let cancelled = false;
    // Con las fuentes listas: si no, la térmica imprime la tipografía de respaldo.
    document.fonts.ready.then(() => requestAnimationFrame(() => !cancelled && window.print()));
    return () => {
      cancelled = true;
      window.removeEventListener("afterprint", done);
    };
  }, [printing]);

  const add = (items: PickerVariant[], quantity: (v: PickerVariant) => number) =>
    setLines((ls) => {
      const next = [...ls];
      for (const v of items) {
        const q = quantity(v);
        if (q <= 0) continue;
        const i = next.findIndex((l) => l.variantId === v.variantId);
        if (i >= 0) next[i] = { ...next[i], quantity: next[i].quantity + q };
        else next.push({ variantId: v.variantId, quantity: q });
      }
      return next;
    });

  // Lector de códigos: el SKU + Enter suma una etiqueta. Un producto agrega todas sus tallas y colores.
  const pick = (value: string) => {
    setQuery("");
    const group = products.get(value);
    if (group) return add(group, () => 1);
    const v = byLabel.get(value) ?? bySku.get(value.trim().toUpperCase());
    if (!v) return setState(failure(`No hay una prenda con el código “${value.trim()}”.`));
    setState(idle);
    add([v], () => 1);
  };

  const warehouseName = warehouses.find((w) => w.id === warehouseId)?.name ?? "";
  const stockOf = (v: PickerVariant) => v.levels[warehouseId] ?? 0;

  return (
    <div className="space-y-5 pb-28">
      <div>
        <p className="mb-1.5 flex items-center gap-2 text-sm font-medium">
          <ScanBarcode className="size-4" aria-hidden /> Prendas
        </p>
        <Combobox
          options={options}
          value={query}
          onChange={setQuery}
          onPick={pick}
          maxResults={40}
          label="Buscar prenda o escanear el código"
          placeholder="Escanea el código o busca una prenda o producto"
        />
        <p className="mt-1.5 text-xs text-muted">Cada lectura suma una etiqueta. Si eliges un producto, entran todas sus tallas y colores.</p>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-line p-4">
        <Field label="Según el stock de" className="min-w-48 flex-1">
          {(a11y) => (
            <SelectWrap>
              <select {...a11y} value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} className={selectClass}>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </SelectWrap>
          )}
        </Field>
        <button type="button" disabled={lines.length === 0} onClick={() => setLines((ls) => ls.map((l) => ({ ...l, quantity: stockOf(byId.get(l.variantId)!) })).filter((l) => l.quantity > 0))} className={buttonClass("secondary")}>
          Una por unidad en stock
        </button>
        <button
          type="button"
          onClick={() => {
            if (window.confirm(`¿Agregar una etiqueta por cada unidad de ${warehouseName}?`)) add(variants, stockOf);
          }}
          className={buttonClass("ghost")}
        >
          Todo el stock de {warehouseName}
        </button>
      </div>

      {lines.length ? (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line">
          {lines.map((l) => {
            const v = byId.get(l.variantId)!;
            return (
              <li key={l.variantId} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <span className="min-w-[10rem] flex-1 text-sm">
                  <span className="font-semibold">{v.productName}</span> · {v.colorName} · Talla {v.sizeLabel}
                  <span className="block font-mono text-xs text-subtle">
                    {v.sku}
                    <span className="ml-2 font-sans text-muted">
                      Stock en {warehouseName}: {stockOf(v)}
                    </span>
                  </span>
                </span>
                <label className="flex items-center gap-2 text-sm">
                  <span className="text-muted">Etiquetas</span>
                  <input
                    type="number"
                    min={0}
                    inputMode="numeric"
                    value={l.quantity}
                    onChange={(e) => setLines((ls) => ls.map((x) => (x.variantId === l.variantId ? { ...x, quantity: Math.max(0, Math.floor(Number(e.target.value) || 0)) } : x)))}
                    aria-label={`Etiquetas de ${v.sku}`}
                    className={cn(inputCompactClass, "w-20 text-center tabular-nums")}
                  />
                </label>
                <button type="button" aria-label={`Quitar ${v.sku}`} onClick={() => setLines((ls) => ls.filter((x) => x.variantId !== l.variantId))} className={cn(buttonClass("ghost", "sm"), "hover:text-danger")}>
                  <Trash2 className="size-4" aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      <div className="flex flex-wrap items-end gap-4">
        <Field label="Formato" className="min-w-64 flex-1">
          {(a11y) => (
            <SelectWrap>
              <select {...a11y} value={format} onChange={(e) => setFormat(e.target.value as FormatKey)} className={selectClass}>
                {Object.entries(FORMATS).map(([key, value]) => (
                  <option key={key} value={key}>
                    {value.label}
                  </option>
                ))}
              </select>
            </SelectWrap>
          )}
        </Field>
        <label className="flex h-12 items-center gap-2 text-sm">
          <input type="checkbox" checked={showPrice} onChange={(e) => setShowPrice(e.target.checked)} className="size-5 accent-white" /> Mostrar precio
        </label>
      </div>

      {labels.length ? <Preview labels={labels} showPrice={showPrice} format={format} fontClass={fontClass} /> : null}

      {printing
        ? createPortal(
            <div className={cn("print-labels", fontClass)}>
              <style>{f.perSheet === 1 ? `@page { size: ${f.width}mm ${f.height}mm; margin: 0 }` : "@page { size: A4; margin: 0 }"}</style>
              {f.perSheet === 1 ? (
                labels.map((v, i) => (
                  <div key={i} style={{ breakAfter: "page" }}>
                    <Label variant={v} showPrice={showPrice} format={format} />
                  </div>
                ))
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: `repeat(${f.columns}, ${f.width}mm)` }}>
                  {labels.map((v, i) => (
                    <div key={i} style={(i + 1) % f.perSheet === 0 ? { breakAfter: "page" } : undefined}>
                      <Label variant={v} showPrice={showPrice} format={format} />
                    </div>
                  ))}
                </div>
              )}
            </div>,
            document.body,
          )
        : null}

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-ink/95 px-4 pt-3 backdrop-blur-md pb-safe lg:left-64">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3">
          <button type="button" onClick={() => setPrinting(true)} disabled={labels.length === 0 || printing} className={buttonClass("primary")}>
            <Printer className="size-4" aria-hidden />
            {labels.length ? `Imprimir ${labels.length} ${labels.length === 1 ? "etiqueta" : "etiquetas"}` : "Agrega prendas"}
          </button>
          {lines.length ? (
            <button type="button" onClick={() => setLines([])} className={buttonClass("ghost", "sm")}>
              Vaciar
            </button>
          ) : null}
          <FormAlert state={state} />
        </div>
      </div>
    </div>
  );
}
