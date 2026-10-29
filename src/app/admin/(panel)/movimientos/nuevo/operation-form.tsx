"use client";

import { ScanBarcode, Trash2 } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { Combobox } from "@/components/admin/combobox";
import { FormAlert } from "@/components/admin/form-controls";
import { buttonClass } from "@/components/admin/ui";
import { Field, inputCompactClass, Segmented, selectClass, SelectWrap } from "@/components/ui/form";
import { failure, idle, type ActionState } from "@/lib/action-state";
import { cn } from "@/lib/cn";
import { EXIT_REASON_LABEL, EXIT_REASONS, formatUnits, OPERATION_LABEL, type ExitReason, type OperationKind } from "@/lib/inventory";
import type { PickerVariant } from "@/server/services/inventory";
import { registerOperationAction } from "../actions";

type Warehouse = { id: string; name: string; code: string; sellsOnline: boolean };
type Line = { variantId: string; quantity: number; cost: string };

const variantLabel = (v: PickerVariant) => `${v.productName} · ${v.colorName} · ${v.sizeLabel} · ${v.sku}`;
const cents = (value: string) => {
  const n = Number(value.replace(",", "."));
  return value.trim() && Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null;
};

export function OperationForm({ warehouses, variants, initialKind }: { warehouses: Warehouse[]; variants: PickerVariant[]; initialKind: OperationKind }) {
  const online = warehouses.find((w) => w.sellsOnline) ?? warehouses[0];
  const other = warehouses.find((w) => w.id !== online.id);
  const [kind, setKind] = useState<OperationKind>(initialKind);
  const [from, setFrom] = useState(initialKind === "traslado" ? (other?.id ?? online.id) : online.id);
  const [to, setTo] = useState(online.id);
  const [reason, setReason] = useState<ExitReason>("devolucion_proveedor");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [query, setQuery] = useState("");
  const [state, setState] = useState<ActionState>(idle);
  const [pending, startTransition] = useTransition();

  // Se arman una vez: con el lector cada lectura es una ráfaga de teclas.
  const { byId, byLabel, bySku, options } = useMemo(
    () => ({
      byId: new Map(variants.map((v) => [v.variantId, v])),
      byLabel: new Map(variants.map((v) => [variantLabel(v), v])),
      bySku: new Map(variants.map((v) => [v.sku.toUpperCase(), v])),
      options: variants.map((v) => ({ value: variantLabel(v) })),
    }),
    [variants],
  );
  const source = kind === "ingreso" ? null : from;
  const units = lines.reduce((s, l) => s + l.quantity, 0);

  const changeKind = (next: OperationKind) => {
    setKind(next);
    if (next === "traslado" && from === to) setFrom(other?.id ?? online.id);
  };

  // Lector de código de barras: escribe el SKU y manda Enter. Si la prenda ya está, suma una.
  const pick = (value: string) => {
    const v = byLabel.get(value) ?? bySku.get(value.trim().toUpperCase());
    setQuery("");
    if (!v) {
      setState(failure(`No hay una prenda con el código “${value.trim()}”.`));
      return;
    }
    setState(idle);
    setLines((ls) => (ls.some((l) => l.variantId === v.variantId) ? ls.map((l) => (l.variantId === v.variantId ? { ...l, quantity: l.quantity + 1 } : l)) : [...ls, { variantId: v.variantId, quantity: 1, cost: "" }]));
  };
  const update = (variantId: string, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.variantId === variantId ? { ...l, ...patch } : l)));

  const submit = () =>
    startTransition(async () => {
      const result = await registerOperationAction({
        kind,
        fromWarehouseId: kind === "ingreso" ? null : from,
        toWarehouseId: kind === "salida" ? null : to,
        reason: kind === "salida" ? reason : null,
        note: note.trim() || null,
        lines: lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity, unitCostCents: kind === "ingreso" ? cents(l.cost) : null })),
      });
      // Si salió bien, la acción ya llevó a la operación creada.
      if (result) setState(result);
    });

  const warehouseSelect = (label: string, value: string, onChange: (id: string) => void) => (
    <Field label={label} className="min-w-48 flex-1">
      {(a11y) => (
        <SelectWrap>
          <select {...a11y} value={value} onChange={(e) => onChange(e.target.value)} className={selectClass}>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
                {w.sellsOnline ? " (web)" : ""}
              </option>
            ))}
          </select>
        </SelectWrap>
      )}
    </Field>
  );

  return (
    <div className="space-y-5 pb-28">
      <Segmented
        label="Tipo de operación"
        value={kind}
        onChange={changeKind}
        options={(["ingreso", "traslado", "salida"] as const).map((k) => ({ value: k, label: k === "ingreso" ? "Ingreso" : OPERATION_LABEL[k] }))}
      />

      <div className="flex flex-wrap gap-4">
        {kind !== "ingreso" ? warehouseSelect(kind === "traslado" ? "Sale de" : "Almacén", from, setFrom) : null}
        {kind !== "salida" ? warehouseSelect(kind === "traslado" ? "Entra a" : "Almacén", to, setTo) : null}
        {kind === "salida" ? (
          <Field label="Motivo" className="min-w-48 flex-1">
            {(a11y) => (
              <SelectWrap>
                <select {...a11y} value={reason} onChange={(e) => setReason(e.target.value as ExitReason)} className={selectClass}>
                  {EXIT_REASONS.map((r) => (
                    <option key={r} value={r}>
                      {EXIT_REASON_LABEL[r]}
                    </option>
                  ))}
                </select>
              </SelectWrap>
            )}
          </Field>
        ) : null}
      </div>

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
          placeholder="Escanea el código o busca por nombre, color o SKU"
        />
        <p className="mt-1.5 text-xs text-muted">Con el lector de códigos: cada lectura suma una unidad.</p>
      </div>

      {lines.length ? (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line">
          {lines.map((l) => {
            const v = byId.get(l.variantId)!;
            const available = source ? (v.levels[source] ?? 0) : null;
            const short = available !== null && l.quantity > available;
            return (
              <li key={l.variantId} className={cn("flex flex-wrap items-center gap-3 px-4 py-3", short && "bg-danger/5")}>
                <span className="min-w-[10rem] flex-1 text-sm">
                  <span className="font-semibold">{v.productName}</span> · {v.colorName} · Talla {v.sizeLabel}
                  <span className="block font-mono text-xs text-subtle">
                    {v.sku}
                    {available !== null ? <span className={cn("ml-2 font-sans", short ? "text-danger" : "text-muted")}>Hay {available}</span> : null}
                  </span>
                </span>
                <label className="flex items-center gap-2 text-sm">
                  <span className="text-muted">Cant.</span>
                  <input
                    type="number"
                    min={1}
                    inputMode="numeric"
                    value={l.quantity}
                    onChange={(e) => update(l.variantId, { quantity: Math.max(1, Math.floor(Number(e.target.value) || 1)) })}
                    aria-label={`Cantidad ${v.sku}`}
                    className={cn(inputCompactClass, "w-20 text-center tabular-nums")}
                  />
                </label>
                {kind === "ingreso" ? (
                  <label className="flex items-center gap-2 text-sm" title="Costo por unidad (para el kardex valorizado)">
                    <span className="whitespace-nowrap text-muted">Costo S/</span>
                    <input
                      inputMode="decimal"
                      value={l.cost}
                      placeholder="—"
                      onChange={(e) => update(l.variantId, { cost: e.target.value })}
                      aria-label={`Costo unitario ${v.sku}`}
                      className={cn(inputCompactClass, "w-24 tabular-nums")}
                    />
                  </label>
                ) : null}
                <button type="button" aria-label={`Quitar ${v.sku}`} onClick={() => setLines((ls) => ls.filter((x) => x.variantId !== l.variantId))} className={cn(buttonClass("ghost", "sm"), "hover:text-danger")}>
                  <Trash2 className="size-4" aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      <Field label="Nota" optional>
        {(a11y) => (
          <textarea
            {...a11y}
            rows={2}
            maxLength={300}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={kind === "ingreso" ? "Ej. Lote de baggys del taller, guía 001-123" : kind === "traslado" ? "Ej. Reposición para la tienda" : "Ej. Fallas de fábrica"}
            className={cn(inputCompactClass, "h-auto py-2")}
          />
        )}
      </Field>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-ink/95 px-4 pt-3 backdrop-blur-md pb-safe lg:left-64">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3">
          <button type="button" onClick={submit} disabled={pending || lines.length === 0} className={buttonClass("primary")}>
            {pending ? "Registrando…" : lines.length ? `Registrar ${formatUnits(units)}` : "Agrega prendas"}
          </button>
          <FormAlert state={state} />
        </div>
      </div>
    </div>
  );
}
