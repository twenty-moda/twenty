/**
 * Cupones de descuento de la web: el cliente escribe un código en el checkout. Lógica pura: la usan el checkout (para
 * mostrar) y el servidor (el descuento que vale es el que calcula al crear el pedido).
 *
 * El cupón se aplica sobre lo que cuestan las prendas después de las promos "N x S/" (el envío no se descuenta).
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
  /** Compra mínima en prendas (después de las promos), en céntimos. */
  minSubtotalCents: number;
};

export const COUPON_CODE_MAX = 30;

/** " twenty10 " → "TWENTY10". El código se guarda y se compara en mayúsculas. */
export const normalizeCouponCode = (code: string) => code.trim().toUpperCase();

/** De 3 a 30 letras, números, guiones o guiones bajos (sin espacios ni tildes, para dictarlo sin dudas). */
export const isValidCouponCode = (code: string) => /^[A-Z0-9][A-Z0-9_-]{2,29}$/.test(code);

/** "10%" o "S/ 20". */
export const couponLabel = (c: Pick<CouponRule, "type" | "value">) => (c.type === "porcentaje" ? `${c.value}%` : formatPrice(c.value));

/** Descuento sobre el total de las prendas. Nunca más que ese total. Por debajo del mínimo, 0. */
export function couponDiscount(coupon: CouponRule, productsTotalCents: number): number {
  if (productsTotalCents <= 0 || productsTotalCents < coupon.minSubtotalCents) return 0;
  const raw = coupon.type === "porcentaje" ? Math.round((productsTotalCents * coupon.value) / 100) : coupon.value;
  return Math.min(raw, coupon.maxDiscountCents ?? raw, productsTotalCents);
}

/** El descuento repartido entre las líneas según lo que cuesta cada una (la última se lleva el resto de los céntimos). */
export function allocateCouponDiscount(discountCents: number, lineTotalsCents: number[]): number[] {
  if (discountCents <= 0) return lineTotalsCents.map(() => 0);
  return allocateOutfitPrice(discountCents, lineTotalsCents);
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
} as const;

export const minimumError = (minSubtotalCents: number) => `Este cupón es para compras desde ${formatPrice(minSubtotalCents)} en prendas.`;
