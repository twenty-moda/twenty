/** Lógica pura del carrito, compartida entre el navegador (store) y el servidor (validación). */

export const MAX_UNITS_PER_LINE = 10;

export type CartPromotion = { id: string; name: string; quantity: number; bundlePriceCents: number };

/** Una pieza elegida de un conjunto (color y talla de una de sus prendas). */
export type OutfitLinePiece = {
  variantId: string;
  /** "Camisa", "Pantalón"… */
  label: string;
  productName: string;
  productSlug: string;
  colorName: string;
  sizeLabel: string;
  image: string | null;
  /** Precio de la prenda por separado (el "antes" del conjunto). */
  priceCents: number;
  stock: number;
};

export type CartLine = {
  /**
   * Clave de la línea: el id de la variante, o en un conjunto `conjunto:<producto>:<variante>,<variante>` (ver
   * outfitLineKey). El servidor recibe las variantes del conjunto aparte, en `outfit`.
   */
  variantId: string;
  quantity: number;
  productSlug: string;
  productName: string;
  colorName: string;
  sizeLabel: string;
  image: string | null;
  priceCents: number;
  compareAtPriceCents: number | null;
  /** Stock conocido la última vez que se validó con el servidor. */
  stock: number;
  promotion: CartPromotion | null;
  /** Solo conjuntos: las piezas elegidas. En la línea, colorName y sizeLabel van vacíos. */
  outfit?: { id: string; pieces: OutfitLinePiece[] } | null;
};

/** Datos frescos de una variante según el servidor. `available: false` = ya no se vende. */
export type VariantSnapshot = Omit<CartLine, "quantity"> & { available: boolean };

export type CartNotice =
  | { type: "removed"; productName: string; variantLabel: string }
  | { type: "reduced"; productName: string; variantLabel: string; quantity: number }
  | { type: "price"; productName: string; variantLabel: string; before: number; after: number };

export const variantLabel = (line: Pick<CartLine, "colorName" | "sizeLabel" | "outfit">) =>
  line.outfit
    ? line.outfit.pieces.map((p) => `${p.label}: ${p.colorName}, talla ${p.sizeLabel}`).join(" · ")
    : `${line.colorName} · Talla ${line.sizeLabel}`;

/** Lo que el servidor necesita de una línea (checkout y revisión del carrito). */
export const lineItem = (line: Pick<CartLine, "variantId" | "quantity" | "outfit">) =>
  line.outfit
    ? { outfitId: line.outfit.id, variantIds: line.outfit.pieces.map((p) => p.variantId), quantity: line.quantity }
    : { variantId: line.variantId, quantity: line.quantity };

export function clampQuantity(quantity: number, stock: number): number {
  return Math.max(0, Math.min(Math.floor(quantity), stock, MAX_UNITS_PER_LINE));
}

/** Agrega unidades a una línea existente o crea una nueva, sin pasar del stock. */
export function addLine(lines: CartLine[], line: Omit<CartLine, "quantity">, quantity: number): CartLine[] {
  const existing = lines.find((l) => l.variantId === line.variantId);
  if (existing) {
    return lines.map((l) =>
      l.variantId === line.variantId ? { ...l, ...line, quantity: clampQuantity(l.quantity + quantity, line.stock) || l.quantity } : l,
    );
  }
  const q = clampQuantity(quantity, line.stock);
  return q > 0 ? [...lines, { ...line, quantity: q }] : lines;
}

export function setLineQuantity(lines: CartLine[], variantId: string, quantity: number): CartLine[] {
  return lines.flatMap((l) => {
    if (l.variantId !== variantId) return [l];
    const q = clampQuantity(quantity, l.stock);
    return q > 0 ? [{ ...l, quantity: q }] : [];
  });
}

/** Aplica los datos frescos del servidor: quita lo que ya no existe, ajusta cantidades y precios, y avisa. */
export function reconcileCart(lines: CartLine[], fresh: VariantSnapshot[]): { lines: CartLine[]; notices: CartNotice[] } {
  const byId = new Map(fresh.map((v) => [v.variantId, v]));
  const notices: CartNotice[] = [];
  const next: CartLine[] = [];
  for (const line of lines) {
    const snapshot = byId.get(line.variantId);
    if (!snapshot || !snapshot.available || snapshot.stock <= 0) {
      notices.push({ type: "removed", productName: line.productName, variantLabel: variantLabel(line) });
      continue;
    }
    const quantity = clampQuantity(line.quantity, snapshot.stock);
    if (quantity < line.quantity) {
      notices.push({ type: "reduced", productName: line.productName, variantLabel: variantLabel(line), quantity });
    }
    if (snapshot.priceCents !== line.priceCents) {
      notices.push({
        type: "price",
        productName: line.productName,
        variantLabel: variantLabel(line),
        before: line.priceCents,
        after: snapshot.priceCents,
      });
    }
    const { available: _available, ...data } = snapshot;
    next.push({ ...data, quantity });
  }
  return { lines: next, notices };
}

export function cartTotals(lines: CartLine[]) {
  let units = 0;
  let subtotalCents = 0;
  let savingsCents = 0;
  for (const l of lines) {
    units += l.quantity;
    subtotalCents += l.priceCents * l.quantity;
    if (l.compareAtPriceCents && l.compareAtPriceCents > l.priceCents) {
      savingsCents += (l.compareAtPriceCents - l.priceCents) * l.quantity;
    }
  }
  return { units, subtotalCents, savingsCents };
}
