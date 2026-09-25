"use client";

import { Minus, Plus, Trash2 } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { MAX_UNITS_PER_LINE, variantLabel, type CartLine } from "@/lib/cart";
import { formatPrice } from "@/lib/money";
import { cartStore } from "./cart-store";

export function CartLineItem({ line, onNavigate }: { line: CartLine; onNavigate?: () => void }) {
  const maxQuantity = Math.min(line.stock, MAX_UNITS_PER_LINE);
  return (
    <li className="flex animate-fade-up gap-3 py-4">
      <Link
        href={`/product/${line.productSlug}`}
        onClick={onNavigate}
        className="relative aspect-3/4 w-20 shrink-0 overflow-hidden rounded-md bg-raised"
      >
        {line.image ? <Image src={line.image} alt={line.productName} fill sizes="80px" className="object-cover" /> : null}
      </Link>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <Link href={`/product/${line.productSlug}`} onClick={onNavigate} className="line-clamp-2 text-sm leading-snug">
              {line.productName}
            </Link>
            <LineOptions line={line} className="mt-0.5" />
          </div>
          <button
            type="button"
            onClick={() => cartStore.remove(line.variantId)}
            aria-label={`Quitar ${line.productName} del carrito`}
            className="-mt-2 -mr-2 grid size-10 shrink-0 place-items-center text-subtle hover:text-white"
          >
            <Trash2 className="size-4" aria-hidden />
          </button>
        </div>

        <div className="mt-auto flex items-end justify-between pt-2">
          <div className="flex h-9 items-center rounded-full border border-line" role="group" aria-label="Cantidad">
            <button
              type="button"
              onClick={() => cartStore.setQuantity(line.variantId, line.quantity - 1)}
              aria-label="Quitar una unidad"
              className="grid size-9 place-items-center"
            >
              <Minus className="size-3.5" aria-hidden />
            </button>
            <span className="w-6 text-center text-sm tabular-nums" aria-live="polite">
              {line.quantity}
            </span>
            <button
              type="button"
              onClick={() => cartStore.setQuantity(line.variantId, line.quantity + 1)}
              disabled={line.quantity >= maxQuantity}
              aria-label="Agregar una unidad"
              className="grid size-9 place-items-center disabled:opacity-30"
            >
              <Plus className="size-3.5" aria-hidden />
            </button>
          </div>
          <div className="text-right">
            {line.compareAtPriceCents && line.compareAtPriceCents > line.priceCents ? (
              <s className="block text-xs text-subtle">{formatPrice(line.compareAtPriceCents * line.quantity)}</s>
            ) : null}
            <p className="text-sm font-semibold">{formatPrice(line.priceCents * line.quantity)}</p>
          </div>
        </div>
        {line.quantity >= maxQuantity && line.stock <= MAX_UNITS_PER_LINE ? (
          <p className="mt-1 text-xs text-warning">{line.outfit ? "Es todo el stock disponible de estas tallas." : "Es todo el stock disponible de esta talla."}</p>
        ) : null}
      </div>
    </li>
  );
}

/** Color y talla de la línea; en un conjunto, los de cada pieza (una por renglón). */
export function LineOptions({ line, className }: { line: CartLine; className?: string }) {
  if (!line.outfit) return <p className={`text-xs text-muted ${className ?? ""}`}>{variantLabel(line)}</p>;
  return (
    <ul className={`space-y-0.5 text-xs text-muted ${className ?? ""}`}>
      {line.outfit.pieces.map((p, i) => (
        <li key={`${p.variantId}-${i}`}>
          {p.label}: {p.colorName}, talla {p.sizeLabel}
        </li>
      ))}
    </ul>
  );
}
