import type { ImageRef, ProductCard } from "@/server/services/catalog";
import { promotionLabel } from "../store/price";

/** Lo justo de cada prenda para la grilla "Lo más buscado" (va al navegador: mientras menos, más liviana la página). */
export type FeaturedItem = {
  id: string;
  slug: string;
  name: string;
  category: { slug: string; name: string };
  detail: string;
  priceCents: number;
  compareAtPriceCents: number | null;
  hasPriceRange: boolean;
  image: ImageRef | null;
  hoverImage: ImageRef | null;
  /** "2 x S/ 100" si está en una promo. */
  promo: string | null;
  isOutfit: boolean;
};

export function toFeaturedItem(p: ProductCard): FeaturedItem {
  const colors = p.colors.length > 1 ? `${p.colors.length} colores` : null;
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    category: p.category,
    detail: [p.outfit ? `Conjunto · ${p.outfit.pieceProductIds.length} piezas` : (p.fit?.name ?? p.category.name), colors].filter(Boolean).join(" · "),
    priceCents: p.priceCents,
    compareAtPriceCents: p.compareAtPriceCents,
    hasPriceRange: p.hasPriceRange,
    image: p.image,
    hoverImage: p.hoverImage,
    promo: p.promotion ? promotionLabel(p.promotion) : null,
    isOutfit: !!p.outfit,
  };
}
