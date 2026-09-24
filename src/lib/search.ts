import type { ProductCard } from "@/server/services/catalog";
import { matchesAllWords } from "./slug";

/** Índice liviano para la búsqueda instantánea del header (se descarga al abrir el buscador). */
export type SearchEntry = {
  slug: string;
  name: string;
  category: string;
  fit: string | null;
  colors: string[];
  image: string | null;
  priceCents: number;
  compareAtPriceCents: number | null;
  inStock: boolean;
};

export function toSearchEntry(card: ProductCard): SearchEntry {
  return {
    slug: card.slug,
    name: card.name,
    category: card.category.name,
    fit: card.fit?.name ?? null,
    colors: card.colors.map((c) => c.name),
    image: card.image?.path ?? null,
    priceCents: card.priceCents,
    compareAtPriceCents: card.compareAtPriceCents,
    inStock: card.inStock,
  };
}

export function searchEntries(entries: SearchEntry[], query: string): SearchEntry[] {
  if (!query.trim()) return [];
  return entries.filter((e) => matchesAllWords([e.name, e.category, e.fit ?? "", ...e.colors].join(" "), query));
}
