"use client";

import Image from "next/image";
import { cn } from "@/lib/cn";
import type { ImageRef } from "@/server/services/catalog";

type Color = { id: string; name: string; images: ImageRef[] };

/** Colores como miniaturas de la foto (tachadas si están agotados). En el teléfono se deslizan. */
export function ColorSwatches({
  colors,
  activeId,
  inStock,
  onChoose,
  small = false,
}: {
  colors: Color[];
  activeId: string;
  inStock: (colorId: string) => boolean;
  onChoose: (colorId: string) => void;
  small?: boolean;
}) {
  return (
    <div className="no-scrollbar -mx-1 mt-2 flex gap-2 overflow-x-auto p-1 md:flex-wrap md:overflow-visible">
      {colors.map((c) => {
        const available = inStock(c.id);
        const active = c.id === activeId;
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => onChoose(c.id)}
            aria-pressed={active}
            aria-label={`${c.name}${available ? "" : " (agotado)"}`}
            title={c.name}
            className={cn(
              "relative aspect-3/4 shrink-0 overflow-hidden rounded-md bg-raised ring-offset-2 ring-offset-ink transition",
              small ? "w-12" : "w-14",
              active ? "ring-2 ring-white" : "opacity-80 hover:opacity-100",
              !available && "opacity-40",
            )}
          >
            {c.images[0] ? <Image src={c.images[0].path} alt="" fill sizes="56px" className="object-cover" /> : null}
            {!available ? <span aria-hidden className="absolute inset-0 bg-[linear-gradient(to_top_right,transparent_48%,white_49%,white_51%,transparent_52%)]" /> : null}
          </button>
        );
      })}
    </div>
  );
}

export type SizeState = "available" | "sold-out" | "missing";

/** Tallas en grilla de 5: la elegida en blanco, las agotadas tachadas. `highlight` marca las disponibles (falta elegir). */
export function SizeGrid({
  sizes,
  activeId,
  stateOf,
  onChoose,
  highlight = false,
}: {
  sizes: { id: string; label: string }[];
  activeId: string | undefined;
  stateOf: (sizeId: string) => SizeState;
  onChoose: (label: string) => void;
  highlight?: boolean;
}) {
  return (
    <div className="mt-3 grid grid-cols-5 gap-2">
      {sizes.map((s) => {
        const state = stateOf(s.id);
        const available = state === "available";
        const active = s.id === activeId;
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => onChoose(s.label)}
            disabled={!available}
            aria-pressed={active}
            aria-label={`Talla ${s.label}${available ? "" : state === "sold-out" ? " (agotada)" : " (no disponible en este color)"}`}
            className={cn(
              "h-12 rounded-lg border text-sm font-semibold transition",
              active ? "border-white bg-white text-black" : "border-line hover:border-white/50",
              !available && "cursor-not-allowed border-transparent bg-raised text-subtle line-through",
              highlight && !active && available && "border-warning",
            )}
          >
            {s.label}
          </button>
        );
      })}
    </div>
  );
}
