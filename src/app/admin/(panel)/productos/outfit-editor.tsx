"use client";

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { FormAlert } from "@/components/admin/form-controls";
import { buttonClass } from "@/components/admin/ui";
import { inputClass, SelectWrap, selectClass } from "@/components/ui/form";
import { cn } from "@/lib/cn";
import { discountPercent, formatPrice } from "@/lib/money";
import { MAX_OUTFIT_PIECES, MIN_OUTFIT_PIECES, pieceLabel } from "@/lib/outfits";
import { idle, type ActionState } from "../../_lib/action-state";
import { saveOutfitAction } from "./actions";

type Candidate = { id: string; name: string; status: "active" | "draft" | "archived"; categoryName: string; minPrice: number | null; totalStock: number };
type Piece = { productId: string; label: string };

/** "70", "69.90", "S/ 70" → céntimos (NaN si no es un número). */
const toCents = (value: string) => {
  const raw = value.replace(/s\/\.?/i, "").replace(/\s/g, "").replace(",", ".");
  return raw ? Math.round(Number(raw) * 100) : Number.NaN;
};

/**
 * Piezas y precio de un conjunto. Cada pieza es una prenda del catálogo: el cliente elige su color y talla, y se
 * descuenta de su stock (el mismo de su venta por separado).
 */
export function OutfitEditor({ productId, candidates, initial }: { productId: string; candidates: Candidate[]; initial: { priceCents: number | null; pieces: Piece[] } }) {
  const [pieces, setPieces] = useState<Piece[]>(() => {
    const start = [...initial.pieces];
    while (start.length < MIN_OUTFIT_PIECES) start.push({ productId: "", label: "" });
    return start;
  });
  const [price, setPrice] = useState(initial.priceCents ? String(initial.priceCents / 100) : "");
  const [state, setState] = useState<ActionState>(idle);
  const [pending, start] = useTransition();

  const byId = new Map(candidates.map((c) => [c.id, c]));
  const categories = [...new Set(candidates.map((c) => c.categoryName))];
  const priceCents = toCents(price);
  const chosen = pieces.map((p) => byId.get(p.productId)).filter((c): c is Candidate => !!c);
  const separately = chosen.length === pieces.length ? chosen.reduce((sum, c) => sum + (c.minPrice ?? 0), 0) : null;
  const percent = separately && priceCents > 0 ? discountPercent(priceCents, separately) : null;

  const update = (index: number, patch: Partial<Piece>) => setPieces((ps) => ps.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  const move = (index: number, direction: -1 | 1) =>
    setPieces((ps) => {
      const next = [...ps];
      [next[index], next[index + direction]] = [next[index + direction], next[index]];
      return next;
    });

  const save = () =>
    start(async () => {
      setState(
        await saveOutfitAction(productId, {
          priceCents,
          pieces: pieces.map((p) => ({ productId: p.productId, label: p.label.trim() || null })),
        }),
      );
    });

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted">
        Elige las prendas del conjunto. En la tienda, el cliente escoge color y talla de cada una, y se descuenta del stock de esa prenda (el mismo que
        usa su venta por separado). Una prenda en borrador se vende solo dentro del conjunto.
      </p>

      <ol className="space-y-3">
        {pieces.map((piece, i) => {
          const candidate = byId.get(piece.productId);
          return (
            <li key={i} className="rounded-xl border border-line p-3 md:p-4">
              <div className="flex items-center gap-2">
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-white text-sm font-bold text-black" aria-hidden>
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <SelectWrap>
                    <select
                      aria-label={`Prenda ${i + 1}`}
                      value={piece.productId}
                      onChange={(e) => update(i, { productId: e.target.value, label: "" })}
                      className={selectClass}
                    >
                      <option value="" disabled>
                        Elige una prenda
                      </option>
                      {categories.map((category) => (
                        <optgroup key={category} label={category}>
                          {candidates
                            .filter((c) => c.categoryName === category)
                            .map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                                {c.status === "draft" ? " (borrador)" : ""}
                              </option>
                            ))}
                        </optgroup>
                      ))}
                    </select>
                  </SelectWrap>
                </div>
                <div className="flex shrink-0">
                  <button type="button" aria-label="Subir" disabled={i === 0} onClick={() => move(i, -1)} className="grid size-10 place-items-center rounded-full hover:bg-raised disabled:opacity-30">
                    <ArrowUp className="size-4" aria-hidden />
                  </button>
                  <button
                    type="button"
                    aria-label="Bajar"
                    disabled={i === pieces.length - 1}
                    onClick={() => move(i, 1)}
                    className="grid size-10 place-items-center rounded-full hover:bg-raised disabled:opacity-30"
                  >
                    <ArrowDown className="size-4" aria-hidden />
                  </button>
                  <button
                    type="button"
                    aria-label="Quitar prenda"
                    disabled={pieces.length <= MIN_OUTFIT_PIECES}
                    onClick={() => setPieces((ps) => ps.filter((_, j) => j !== i))}
                    className="grid size-10 place-items-center rounded-full text-subtle hover:bg-raised hover:text-danger disabled:opacity-30"
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                </div>
              </div>
              {candidate ? (
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                  <label className="block">
                    <span className="mb-1.5 block text-xs text-muted">Nombre de la pieza en la tienda</span>
                    <input
                      value={piece.label}
                      onChange={(e) => update(i, { label: e.target.value })}
                      maxLength={40}
                      placeholder={pieceLabel(null, candidate.categoryName)}
                      className={cn(inputClass, "h-11")}
                    />
                  </label>
                  <p className="text-xs sm:pb-3 sm:text-right">
                    <span className="text-muted">{candidate.minPrice === null ? "Sin precio" : `Sola: ${formatPrice(candidate.minPrice)}`}</span>
                    {" · "}
                    {candidate.totalStock === 0 ? <span className="text-danger">Sin stock</span> : <span className="text-muted">{candidate.totalStock} en stock</span>}
                  </p>
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>

      {pieces.length < MAX_OUTFIT_PIECES ? (
        <button type="button" onClick={() => setPieces((ps) => [...ps, { productId: "", label: "" }])} className={buttonClass("secondary", "sm")}>
          <Plus className="size-4" aria-hidden /> Agregar otra prenda
        </button>
      ) : null}

      <label className="block max-w-xs">
        <span className="mb-1.5 block text-sm font-medium">Precio del conjunto</span>
        <div className="flex items-center rounded-xl border border-line bg-raised pl-4 focus-within:border-white">
          <span className="text-muted">S/</span>
          <input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" placeholder="110" className="h-12 min-w-0 flex-1 bg-transparent px-2 text-base outline-none" />
        </div>
      </label>
      {separately ? (
        <p className={cn("-mt-3 text-sm", priceCents >= separately ? "text-warning" : "text-muted")}>
          Por separado cuestan desde {formatPrice(separately)}.{" "}
          {priceCents > 0 && priceCents < separately
            ? `El cliente ahorra ${formatPrice(separately - priceCents)}${percent ? ` (-${percent}%)` : ""}: en la tienda se muestra tachado.`
            : priceCents >= separately
              ? "El conjunto cuesta igual o más que por separado."
              : null}
        </p>
      ) : null}

      <FormAlert state={state} />
      <button type="button" onClick={save} disabled={pending} className={buttonClass("primary")}>
        {pending ? "Guardando…" : "Guardar conjunto"}
      </button>
    </div>
  );
}
