/**
 * Tags de caché de la tienda. El admin invalida solo lo que cambió:
 *   updateTag(cacheTags.product(slug)) al editar un producto,
 *   updateTag(cacheTags.catalog) al cambiar precios, stock o categorías en bloque.
 */
export const cacheTags = {
  catalog: "catalog",
  product: (slug: string) => `product:${slug}`,
  content: "content",
  /** Artículos del blog (lista y detalle). */
  blog: "blog",
  shipping: "shipping",
} as const;
