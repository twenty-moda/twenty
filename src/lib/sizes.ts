const LETTER_SIZES = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "XXXL"];

/** Orden natural de tallas: primero letras (XS…XXL), luego numéricas (28, 30…), luego el resto. */
export function sizeRank(label: string): number {
  const value = label.trim().toUpperCase();
  const letter = LETTER_SIZES.indexOf(value);
  if (letter >= 0) return letter;
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return 100 + numeric;
  return 10_000;
}

export function compareSizes(a: string, b: string): number {
  return sizeRank(a) - sizeRank(b) || a.localeCompare(b);
}
