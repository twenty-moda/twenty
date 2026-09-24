/**
 * Cálculo del total con promociones "N x S/". Se usa en el carrito (para mostrar) y en el servidor
 * (el precio que vale es el que calcula el servidor al crear el pedido).
 *
 * Regla (igual que en la plataforma anterior): si el carrito tiene N o más prendas de la promo,
 * cada una de esas prendas cuesta precioPaquete / N. Ej. "2 x S/ 100": 3 Mom Jean = 3 × S/ 50.
 */

export type PricedPromotion = { id: string; name: string; quantity: number; bundlePriceCents: number };

export type PricingLine = {
  variantId: string;
  quantity: number;
  unitPriceCents: number;
  promotion: PricedPromotion | null;
};

export type PricingResult = {
  lines: { variantId: string; subtotalCents: number; discountCents: number; totalCents: number }[];
  promotions: (PricedPromotion & { units: number; discountCents: number })[];
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
};

export function priceLines(lines: PricingLine[]): PricingResult {
  const unitsByPromotion = new Map<string, number>();
  for (const l of lines) {
    if (l.promotion) unitsByPromotion.set(l.promotion.id, (unitsByPromotion.get(l.promotion.id) ?? 0) + l.quantity);
  }

  // Descuento por línea. Se calcula por promo para que el total cuadre exacto aunque el precio por prenda
  // tenga decimales (3 x S/ 100 → 3 prendas = S/ 100.00, no 99.99).
  const lineDiscount = new Map<number, number>();
  const promoDiscount = new Map<string, number>();
  const promotionsInCart = [...new Map(lines.filter((l) => l.promotion).map((l) => [l.promotion!.id, l.promotion!])).values()];
  for (const p of promotionsInCart) {
    if ((unitsByPromotion.get(p.id) ?? 0) < p.quantity) continue;
    const exactUnit = p.bundlePriceCents / p.quantity;
    // Nunca sube el precio: si la prenda ya cuesta menos que la promo, se queda como está.
    const eligible = lines.map((l, i) => ({ l, i })).filter(({ l }) => l.promotion?.id === p.id && l.unitPriceCents > exactUnit);
    const units = eligible.reduce((s, { l }) => s + l.quantity, 0);
    const regular = eligible.reduce((s, { l }) => s + l.unitPriceCents * l.quantity, 0);
    const total = Math.max(0, regular - Math.round(units * exactUnit));
    let assigned = 0;
    eligible.forEach(({ l, i }, k) => {
      const share = k === eligible.length - 1 ? total - assigned : Math.round((total * l.unitPriceCents * l.quantity) / regular);
      assigned += share;
      lineDiscount.set(i, share);
    });
    promoDiscount.set(p.id, total);
  }

  const priced = lines.map((l, i) => {
    const subtotalCents = l.unitPriceCents * l.quantity;
    const discountCents = lineDiscount.get(i) ?? 0;
    return { variantId: l.variantId, subtotalCents, discountCents, totalCents: subtotalCents - discountCents };
  });

  const promotions = promotionsInCart.map((p) => ({
    ...p,
    units: unitsByPromotion.get(p.id) ?? 0,
    discountCents: promoDiscount.get(p.id) ?? 0,
  }));

  const subtotalCents = priced.reduce((s, l) => s + l.subtotalCents, 0);
  const discountCents = priced.reduce((s, l) => s + l.discountCents, 0);
  return { lines: priced, promotions, subtotalCents, discountCents, totalCents: subtotalCents - discountCents };
}
