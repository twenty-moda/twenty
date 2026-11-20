/**
 * Estado de un producto: dónde se vende.
 * - Publicado: en la web y en el punto de venta.
 * - Solo tienda: en el punto de venta; en la web no aparece por ningún lado (pedido de TWENTY, 19/11/2026, para
 *   pasar todo lo que vendía Insaga y emitir boletas y facturas sin publicarlo).
 * - Borrador: todavía no está en la web (fotos, textos); si es pieza de un conjunto, se vende dentro del conjunto.
 * - Archivado: retirado; se conserva por los pedidos.
 * El punto de venta vende cualquier estado: la web solo los publicados.
 */
export const PRODUCT_STATUSES = ["active", "pos_only", "draft", "archived"] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

export const PRODUCT_STATUS_LABEL: Record<ProductStatus, string> = {
  active: "Publicado",
  pos_only: "Solo tienda",
  draft: "Borrador",
  archived: "Archivado",
};

/** Una prenda va dentro de un conjunto de la web si está publicada o en borrador (no si es solo de tienda ni archivada). */
export const OUTFIT_PIECE_STATUSES = ["active", "draft"] as const satisfies readonly ProductStatus[];

export function canBeOutfitPiece(status: ProductStatus): boolean {
  return (OUTFIT_PIECE_STATUSES as readonly ProductStatus[]).includes(status);
}

/** Por qué una pieza deja su conjunto sin vender, o null si puede ir. */
export function outfitPieceProblem(status: ProductStatus): string | null {
  if (status === "archived") return "está archivada";
  if (status === "pos_only") return "es solo de tienda";
  return null;
}
