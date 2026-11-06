/**
 * Cupones de descuento de la web: el cliente escribe un código en el checkout. Lógica pura: la usan el checkout (para
 * mostrar) y el servidor (el descuento que vale es el que calcula al crear el pedido).
 *
 * El cupón se aplica sobre lo que cuestan las prendas después de las promos "N x S/" (el envío no se descuenta): todas,
 * o solo las de ciertos productos (`productSlugs`).
 */
import { allocateOutfitPrice } from "./outfits";
import { formatPrice } from "./money";

export const COUPON_TYPES = ["porcentaje", "monto"] as const;
export type CouponType = (typeof COUPON_TYPES)[number];

export type CouponRule = {
  code: string;
  type: CouponType;
  /** Porcentaje (1 a 100) o monto en céntimos. */
  value: number;
  /** Tope del descuento en céntimos (solo porcentaje). */
  maxDiscountCents: number | null;
  /** Compra mínima en las prendas a las que se aplica (después de las promos), en céntimos. */
  minSubtotalCents: number;
  /** Solo estas prendas y conjuntos (slug del producto). null = todas. */
  productSlugs: string[] | null;
};

/** Una línea del carrito para el cupón: de qué producto es y cuánto cuesta después de las promos. */
export type CouponLine = { productSlug: string; totalCents: number };

export const COUPON_CODE_MAX = 30;

/** " twenty10 " → "TWENTY10". El código se guarda y se compara en mayúsculas. */
export const normalizeCouponCode = (code: string) => code.trim().toUpperCase();

/** De 3 a 30 letras, números, guiones o guiones bajos (sin espacios ni tildes, para dictarlo sin dudas). */
export const isValidCouponCode = (code: string) => /^[A-Z0-9][A-Z0-9_-]{2,29}$/.test(code);

/** "10%" o "S/ 20". */
export const couponLabel = (c: Pick<CouponRule, "type" | "value">) => (c.type === "porcentaje" ? `${c.value}%` : formatPrice(c.value));

/**
 * Descuento sobre lo que cuestan las prendas a las que se aplica (`baseCents`). Nunca más que eso. Por debajo del
 * mínimo, 0.
 */
export function couponDiscount(coupon: Omit<CouponRule, "code" | "productSlugs">, baseCents: number): number {
  if (baseCents <= 0 || baseCents < coupon.minSubtotalCents) return 0;
  const raw = coupon.type === "porcentaje" ? Math.round((baseCents * coupon.value) / 100) : coupon.value;
  return Math.min(raw, coupon.maxDiscountCents ?? raw, baseCents);
}

/** El descuento repartido entre las líneas según lo que cuesta cada una (la última se lleva el resto de los céntimos). */
export function allocateCouponDiscount(discountCents: number, lineTotalsCents: number[]): number[] {
  if (discountCents <= 0) return lineTotalsCents.map(() => 0);
  return allocateOutfitPrice(discountCents, lineTotalsCents);
}

/** Si el cupón se aplica a la prenda o conjunto con ese slug. */
export const couponAppliesTo = (coupon: Pick<CouponRule, "productSlugs">, productSlug: string) =>
  coupon.productSlugs === null || coupon.productSlugs.includes(productSlug);

/** Lo que cuestan, en el carrito, las prendas a las que se aplica el cupón. */
export const couponBaseCents = (coupon: Pick<CouponRule, "productSlugs">, lines: CouponLine[]) =>
  lines.reduce((sum, l) => sum + (couponAppliesTo(coupon, l.productSlug) ? l.totalCents : 0), 0);

/** El cupón sobre el carrito: el descuento y la parte de cada línea (0 en las que no entran). */
export function applyCoupon(coupon: CouponRule, lines: CouponLine[]): { discountCents: number; shares: number[] } {
  const applies = lines.map((l) => couponAppliesTo(coupon, l.productSlug));
  const discountCents = couponDiscount(coupon, couponBaseCents(coupon, lines));
  const eligibleShares = allocateCouponDiscount(
    discountCents,
    lines.filter((_, i) => applies[i]).map((l) => l.totalCents),
  );
  let next = 0;
  return { discountCents, shares: applies.map((a) => (a ? eligibleShares[next++] : 0)) };
}

/** Por qué el cupón no descuenta nada con este carrito (texto para el cliente). null = sí descuenta. */
export function couponCartError(coupon: CouponRule, lines: CouponLine[]): string | null {
  const baseCents = couponBaseCents(coupon, lines);
  if (coupon.productSlugs && baseCents === 0) return COUPON_ERRORS.notInCart;
  if (couponDiscount(coupon, baseCents) === 0) return minimumError(coupon.minSubtotalCents, coupon.productSlugs !== null);
  return null;
}

/** Por qué no se puede usar un cupón (texto para el cliente). */
export const COUPON_ERRORS = {
  notFound: "Ese cupón no existe. Revisa que esté bien escrito.",
  inactive: "Ese cupón ya no está activo.",
  notStarted: "Ese cupón todavía no empieza.",
  expired: "Ese cupón ya venció.",
  exhausted: "Ese cupón ya se usó todas las veces posibles.",
  perCustomer: "Ya usaste este cupón.",
  firstPurchase: "Este cupón es solo para tu primera compra.",
  notInCart: "Este cupón es para otras prendas: no aplica a las de tu carrito.",
} as const;

/** `onlySome`: el cupón es solo para ciertas prendas (el mínimo se cuenta con ellas). */
export const minimumError = (minSubtotalCents: number, onlySome = false) =>
  `Este cupón es para compras desde ${formatPrice(minSubtotalCents)} en ${onlySome ? "las prendas que participan" : "prendas"}.`;
