import type { ProductCard } from "@/server/services/catalog";
import { compareSizes } from "./sizes";
import { matchesAllWords } from "./slug";

export const SORT_OPTIONS = {
  recomendados: "Recomendados",
  "precio-asc": "Precio: menor a mayor",
  "precio-desc": "Precio: mayor a menor",
  nombre: "Nombre (A-Z)",
} as const;
export type SortKey = keyof typeof SORT_OPTIONS;

/** Rangos en céntimos: (min, max]. */
export const PRICE_RANGES = {
  "hasta-50": { label: "Hasta S/ 50", min: -1, max: 5000 },
  "50-80": { label: "S/ 50 a S/ 80", min: 5000, max: 8000 },
  "mas-80": { label: "Más de S/ 80", min: 8000, max: Number.POSITIVE_INFINITY },
} as const;
export type PriceRangeKey = keyof typeof PRICE_RANGES;

export type CatalogFilters = {
  q: string;
  categoria: string | null;
  fits: string[];
  tallas: string[];
  colores: string[];
  precio: PriceRangeKey | null;
  promo: string | null;
  orden: SortKey;
};

export const EMPTY_FILTERS: CatalogFilters = {
  q: "",
  categoria: null,
  fits: [],
  tallas: [],
  colores: [],
  precio: null,
  promo: null,
  orden: "recomendados",
};

const list = (value: string | null) =>
  value
    ? [
        ...new Set(
          value
            .split(",")
            .map((v) => v.trim())
            .filter(Boolean),
        ),
      ]
    : [];

export function parseFilters(params: URLSearchParams): CatalogFilters {
  const orden = params.get("orden");
  const precio = params.get("precio");
  return {
    q: params.get("q")?.trim() ?? "",
    // "category" es el nombre que usaban los enlaces de la plataforma anterior.
    categoria: params.get("categoria") || params.get("category") || null,
    fits: list(params.get("fit")),
    tallas: list(params.get("talla")).map((t) => t.toUpperCase()),
    colores: list(params.get("color")),
    precio: precio && precio in PRICE_RANGES ? (precio as PriceRangeKey) : null,
    promo: params.get("promo") || null,
    orden: orden && orden in SORT_OPTIONS ? (orden as SortKey) : "recomendados",
  };
}

export function serializeFilters(filters: CatalogFilters): string {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.categoria) params.set("categoria", filters.categoria);
  if (filters.fits.length) params.set("fit", filters.fits.join(","));
  if (filters.tallas.length) params.set("talla", filters.tallas.join(","));
  if (filters.colores.length) params.set("color", filters.colores.join(","));
  if (filters.precio) params.set("precio", filters.precio);
  if (filters.promo) params.set("promo", filters.promo);
  if (filters.orden !== "recomendados") params.set("orden", filters.orden);
  return params.toString();
}

/** Filtros del panel (no cuenta la categoría ni la búsqueda, que se ven aparte). */
export function countActiveFilters(filters: CatalogFilters): number {
  return filters.fits.length + filters.tallas.length + filters.colores.length + Number(!!filters.precio) + Number(!!filters.promo);
}

function matchesQuery(card: ProductCard, query: string): boolean {
  return matchesAllWords([card.name, card.category.name, card.fit?.name ?? "", ...card.colors.map((c) => c.name)].join(" "), query);
}

/** Filtros "de contexto": búsqueda y categoría. Definen qué opciones se ofrecen en el panel. */
function inContext(card: ProductCard, filters: CatalogFilters) {
  return (!filters.categoria || card.category.slug === filters.categoria) && matchesQuery(card, filters.q);
}

export function applyFilters(cards: ProductCard[], filters: CatalogFilters): ProductCard[] {
  const range = filters.precio ? PRICE_RANGES[filters.precio] : null;
  const result = cards.filter(
    (card) =>
      inContext(card, filters) &&
      (!filters.fits.length || (card.fit && filters.fits.includes(card.fit.slug))) &&
      (!filters.tallas.length || card.sizes.some((s) => filters.tallas.includes(s))) &&
      (!filters.colores.length || card.colors.some((c) => c.inStock && filters.colores.includes(c.slug))) &&
      (!range || (card.priceCents > range.min && card.priceCents <= range.max)) &&
      (!filters.promo || card.promotion?.id === filters.promo),
  );
  const byStock = (a: ProductCard, b: ProductCard) => Number(b.inStock) - Number(a.inStock);
  switch (filters.orden) {
    case "precio-asc":
      return result.sort((a, b) => byStock(a, b) || a.priceCents - b.priceCents);
    case "precio-desc":
      return result.sort((a, b) => byStock(a, b) || b.priceCents - a.priceCents);
    case "nombre":
      return result.sort((a, b) => byStock(a, b) || a.name.localeCompare(b.name, "es"));
    default:
      return result; // ya vienen en el orden recomendado
  }
}

export type Facets = {
  fits: { slug: string; name: string; count: number }[];
  tallas: { label: string; count: number }[];
  colores: { slug: string; name: string; hex: string | null; count: number }[];
  /** `categories`: dónde aplica, para distinguir dos promos con el mismo "2 x S/ 100". */
  promos: { id: string; name: string; quantity: number; bundlePriceCents: number; count: number; categories: string[] }[];
};

/** Opciones disponibles dentro de la categoría y búsqueda actuales, con cuántas prendas tiene cada una. */
export function buildFacets(cards: ProductCard[], filters: CatalogFilters): Facets {
  const fits = new Map<string, Facets["fits"][number]>();
  const tallas = new Map<string, Facets["tallas"][number]>();
  const colores = new Map<string, Facets["colores"][number]>();
  const promos = new Map<string, Facets["promos"][number]>();
  for (const card of cards) {
    if (!inContext(card, filters)) continue;
    if (card.fit) {
      const f = fits.get(card.fit.slug) ?? { ...card.fit, count: 0 };
      f.count++;
      fits.set(card.fit.slug, f);
    }
    for (const label of card.sizes) {
      const t = tallas.get(label) ?? { label, count: 0 };
      t.count++;
      tallas.set(label, t);
    }
    for (const c of card.colors) {
      if (!c.inStock) continue;
      const entry = colores.get(c.slug) ?? { slug: c.slug, name: c.name, hex: c.hex, count: 0 };
      entry.count++;
      colores.set(c.slug, entry);
    }
    if (card.promotion) {
      const p = promos.get(card.promotion.id) ?? { ...card.promotion, count: 0, categories: [] };
      p.count++;
      if (!p.categories.includes(card.category.name)) p.categories.push(card.category.name);
      promos.set(card.promotion.id, p);
    }
  }
  return {
    fits: [...fits.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "es")),
    tallas: [...tallas.values()].sort((a, b) => compareSizes(a.label, b.label)),
    colores: [...colores.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "es")),
    promos: [...promos.values()],
  };
}
