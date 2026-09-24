/**
 * Precios en céntimos de sol → "S/ 70" o "S/ 69.90".
 * Formato manual (no Intl) para que servidor y navegador rendericen exactamente lo mismo.
 */
export function formatPrice(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(Math.round(cents));
  const soles = Math.floor(abs / 100);
  const rest = abs % 100;
  const int = String(soles).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${sign}S/ ${int}${rest ? `.${String(rest).padStart(2, "0")}` : ""}`;
}

/** Porcentaje de descuento redondeado; null si no hay precio anterior mayor. */
export function discountPercent(priceCents: number, compareAtCents: number | null | undefined): number | null {
  if (!compareAtCents || compareAtCents <= priceCents) return null;
  return Math.round((1 - priceCents / compareAtCents) * 100);
}
