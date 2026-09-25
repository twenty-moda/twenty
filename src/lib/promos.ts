import type { ProductCard, PromotionBadge } from "@/server/services/catalog";
import { discountPercent } from "./money";

export type PromoGroup = { promotion: PromotionBadge; products: ProductCard[] };

export type PromoSections = {
  /** Promos "N x S/" con sus prendas, en el orden en que aparecen en el catálogo. */
  bundles: PromoGroup[];
  /** Prendas con precio rebajado (precio anterior tachado) que no están en una promo "N x S/". */
  discounted: ProductCard[];
  /** El mayor descuento de `discounted` ("Hasta -20%"). */
  maxDiscountPercent: number | null;
  /** Prendas en total (el menú muestra "Promos" solo si hay alguna). */
  productCount: number;
};

/**
 * Lo que va en /promos: prendas con stock que están en una promo "N x S/" (agrupadas por promo) o rebajadas.
 * Cada prenda aparece una sola vez: si tiene las dos cosas va en su promo (su tarjeta igual muestra el -%).
 */
export function promoSections(products: ProductCard[]): PromoSections {
  const bundles = new Map<string, PromoGroup>();
  const discounted: ProductCard[] = [];
  for (const p of products) {
    if (!p.inStock) continue;
    if (p.promotion) {
      const group = bundles.get(p.promotion.id) ?? { promotion: p.promotion, products: [] };
      group.products.push(p);
      bundles.set(p.promotion.id, group);
    } else if (p.compareAtPriceCents && !p.outfit) {
      // Los conjuntos muestran su precio "por separado" tachado, pero no son prendas rebajadas.
      discounted.push(p);
    }
  }
  const percents = discounted.map((p) => discountPercent(p.priceCents, p.compareAtPriceCents) ?? 0);
  const groups = [...bundles.values()];
  return {
    bundles: groups,
    discounted,
    maxDiscountPercent: Math.max(0, ...percents) || null,
    productCount: groups.reduce((sum, g) => sum + g.products.length, 0) + discounted.length,
  };
}
