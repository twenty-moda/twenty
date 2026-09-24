"use client";

import { Tag } from "lucide-react";
import { type CartLine } from "@/lib/cart";
import { formatPrice } from "@/lib/money";
import { priceLines } from "@/lib/pricing";
import { promotionLabel } from "../store/price";

/** "Te falta 1 prenda para la promo 2 x S/ 100" o "Promo aplicada: ahorras S/ 40". */
export function PromotionHints({ lines }: { lines: CartLine[] }) {
  const progress = priceLines(
    lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity, unitPriceCents: l.priceCents, promotion: l.promotion })),
  ).promotions.map((p) => ({ promotion: p, missing: Math.max(0, p.quantity - p.units), discountCents: p.discountCents }));
  if (progress.length === 0) return null;
  return (
    <ul className="space-y-2">
      {progress.map(({ promotion, missing, discountCents }) => (
        <li key={promotion.id} className="flex gap-2 rounded-lg bg-raised px-3 py-2.5 text-xs leading-relaxed">
          <Tag className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>
            <strong className="font-semibold">Promo {promotionLabel(promotion)}</strong>
            {missing > 0 ? (
              <>
                {" · "}Te {missing === 1 ? "falta 1 prenda" : `faltan ${missing} prendas`} de la promo para activarla (puedes combinar colores y tallas).
              </>
            ) : (
              <> · ¡Aplicada! Ahorras {formatPrice(discountCents)}.</>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}
