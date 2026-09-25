/**
 * Conjuntos (outfits): varias prendas que se venden juntas a un precio. El cliente elige color y talla de cada pieza
 * y el stock es el de cada prenda (se comparte con su venta por separado). Lógica pura: la usan el navegador y el
 * servidor.
 */

export const MIN_OUTFIT_PIECES = 2;
export const MAX_OUTFIT_PIECES = 4;

/**
 * Clave de la línea del carrito para un conjunto con las variantes elegidas (en el orden de las piezas). Dos veces el
 * mismo conjunto con otras tallas son dos líneas distintas.
 */
export const outfitLineKey = (outfitId: string, variantIds: string[]) => `conjunto:${outfitId}:${variantIds.join(",")}`;

/**
 * Reparte el precio del conjunto entre sus piezas, en proporción al precio de cada una por separado, en céntimos
 * enteros y sumando exacto. Así el pedido guarda una fila por prenda (stock y empaque) y el total cuadra.
 */
export function allocateOutfitPrice(outfitPriceCents: number, piecePricesCents: number[]): number[] {
  const total = piecePricesCents.reduce((sum, p) => sum + p, 0);
  if (piecePricesCents.length === 0) return [];
  if (total <= 0) {
    const even = Math.floor(outfitPriceCents / piecePricesCents.length);
    return piecePricesCents.map((_, i) => (i === piecePricesCents.length - 1 ? outfitPriceCents - even * i : even));
  }
  let assigned = 0;
  return piecePricesCents.map((price, i) => {
    const share = i === piecePricesCents.length - 1 ? outfitPriceCents - assigned : Math.round((outfitPriceCents * price) / total);
    assigned += share;
    return share;
  });
}

/** Cuántos conjuntos alcanzan con el stock de las variantes elegidas (una variante puede repetirse en dos piezas). */
export function outfitStock(pieces: { variantId: string; stock: number }[]): number {
  if (pieces.length === 0) return 0;
  const uses = new Map<string, number>();
  for (const p of pieces) uses.set(p.variantId, (uses.get(p.variantId) ?? 0) + 1);
  return Math.min(...pieces.map((p) => Math.floor(p.stock / uses.get(p.variantId)!)));
}

/** "PANTALONES" → "Pantalones": nombre por defecto de una pieza (su categoría). */
export const pieceLabel = (label: string | null | undefined, categoryName: string) =>
  label?.trim() || categoryName.charAt(0).toLocaleUpperCase("es") + categoryName.slice(1).toLocaleLowerCase("es");

type GroupableItem = { outfitId: string | null; outfitName: string | null; outfitLine: number | null; quantity: number; totalCents: number };

export type OrderItemGroup<T> = { kind: "single"; item: T } | { kind: "outfit"; key: string; name: string; quantity: number; totalCents: number; items: T[] };

/** Junta las piezas de cada conjunto del pedido (para mostrarlas juntas), en el orden en que aparecen. */
export function groupOrderItems<T extends GroupableItem>(items: T[]): OrderItemGroup<T>[] {
  const groups: OrderItemGroup<T>[] = [];
  const outfits = new Map<string, Extract<OrderItemGroup<T>, { kind: "outfit" }>>();
  for (const item of items) {
    if (!item.outfitId || item.outfitLine === null) {
      groups.push({ kind: "single", item });
      continue;
    }
    const key = `${item.outfitId}:${item.outfitLine}`;
    let group = outfits.get(key);
    if (!group) {
      group = { kind: "outfit", key, name: item.outfitName ?? "Conjunto", quantity: item.quantity, totalCents: 0, items: [] };
      outfits.set(key, group);
      groups.push(group);
    }
    group.items.push(item);
    group.totalCents += item.totalCents;
  }
  return groups;
}
