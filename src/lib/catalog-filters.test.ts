import { describe, expect, it } from "vitest";
import type { ProductCard } from "@/server/services/catalog";
import { applyFilters, buildFacets, countActiveFilters, EMPTY_FILTERS, parseFilters, serializeFilters } from "./catalog-filters";

function card(overrides: Partial<ProductCard> & Pick<ProductCard, "slug" | "name">): ProductCard {
  return {
    id: overrides.slug,
    category: { slug: "pantalones", name: "Pantalones" },
    fit: { slug: "baggy-jean", name: "Baggy Jean" },
    priceCents: 7000,
    compareAtPriceCents: null,
    hasPriceRange: false,
    image: null,
    hoverImage: null,
    colors: [{ slug: "negro", name: "Negro", hex: "#000000", inStock: true }],
    sizes: ["28", "30"],
    inStock: true,
    isFeatured: false,
    promotion: null,
    position: 0,
    ...overrides,
  };
}

const promo = { id: "promo-2x100", name: "2 X 100", quantity: 2, bundlePriceCents: 10000 };
const cards = [
  card({ slug: "baggy-angel", name: "Baggy Ángel", priceCents: 9900 }),
  card({ slug: "mom-jean", name: "Pantalón Mom Jean", fit: { slug: "mom-jean", name: "Mom Jean" }, promotion: promo, sizes: ["32"] }),
  card({
    slug: "polo-slim",
    name: "Polo Slim Fit",
    category: { slug: "polos", name: "Polos" },
    fit: { slug: "slim-fit", name: "Slim Fit" },
    priceCents: 3000,
    colors: [
      { slug: "blanco", name: "Blanco", hex: "#ffffff", inStock: true },
      { slug: "negro", name: "Negro", hex: "#000000", inStock: false },
    ],
    sizes: ["M", "L"],
  }),
  card({
    slug: "agotado",
    name: "Jacket Cuerina",
    category: { slug: "jacket", name: "Jacket" },
    colors: [{ slug: "negro", name: "Negro", hex: "#000000", inStock: false }],
    sizes: [],
    inStock: false,
    priceCents: 10000,
  }),
];

describe("parseFilters / serializeFilters", () => {
  it("lee la URL y vuelve a escribirla igual", () => {
    const query = "q=jean&categoria=pantalones&fit=baggy-jean,mom-jean&talla=30,32&color=negro&precio=50-80&orden=precio-asc";
    const filters = parseFilters(new URLSearchParams(query));
    expect(filters).toMatchObject({ q: "jean", categoria: "pantalones", fits: ["baggy-jean", "mom-jean"], tallas: ["30", "32"], precio: "50-80", orden: "precio-asc" });
    expect(serializeFilters(filters)).toBe(query.replace(",", "%2C").replace("30,32", "30%2C32"));
  });

  it("acepta ?category= de los enlaces antiguos e ignora valores inválidos", () => {
    const filters = parseFilters(new URLSearchParams("category=jacket&orden=xxx&precio=gratis&talla=m"));
    expect(filters).toMatchObject({ categoria: "jacket", orden: "recomendados", precio: null, tallas: ["M"] });
  });

  it("omite los valores por defecto", () => {
    expect(serializeFilters(EMPTY_FILTERS)).toBe("");
  });
});

describe("applyFilters", () => {
  const run = (query: string) => applyFilters(cards, parseFilters(new URLSearchParams(query))).map((c) => c.slug);

  it("busca sin importar tildes ni mayúsculas, en nombre, categoría, fit y color", () => {
    expect(run("q=ANGEL")).toEqual(["baggy-angel"]);
    expect(run("q=polos blanco")).toEqual(["polo-slim"]);
    expect(run("q=mom jean")).toEqual(["mom-jean"]);
  });

  it("filtra por categoría, fit, talla con stock y color con stock", () => {
    expect(run("categoria=pantalones")).toEqual(["baggy-angel", "mom-jean"]);
    expect(run("fit=mom-jean,slim-fit")).toEqual(["mom-jean", "polo-slim"]);
    expect(run("talla=32")).toEqual(["mom-jean"]);
    expect(run("color=negro")).toEqual(["baggy-angel", "mom-jean"]); // el negro del polo no tiene stock
  });

  it("filtra por rango de precio y por promoción", () => {
    expect(run("precio=hasta-50")).toEqual(["polo-slim"]);
    expect(run("precio=mas-80")).toEqual(["baggy-angel", "agotado"]);
    expect(run("promo=promo-2x100")).toEqual(["mom-jean"]);
  });

  it("ordena por precio dejando lo agotado al final", () => {
    expect(run("orden=precio-desc")).toEqual(["baggy-angel", "mom-jean", "polo-slim", "agotado"]);
    expect(run("orden=precio-asc")).toEqual(["polo-slim", "mom-jean", "baggy-angel", "agotado"]);
  });
});

describe("buildFacets", () => {
  it("ofrece solo las opciones de la categoría actual y cuenta prendas", () => {
    const facets = buildFacets(cards, parseFilters(new URLSearchParams("categoria=pantalones&talla=28")));
    expect(facets.fits.map((f) => [f.slug, f.count])).toEqual([["baggy-jean", 1], ["mom-jean", 1]]);
    expect(facets.tallas.map((t) => t.label)).toEqual(["28", "30", "32"]); // la talla elegida no reduce las opciones
    expect(facets.promos.map((p) => p.id)).toEqual(["promo-2x100"]);
  });
});

describe("countActiveFilters", () => {
  it("no cuenta la categoría ni la búsqueda", () => {
    expect(countActiveFilters(parseFilters(new URLSearchParams("q=x&categoria=polos&talla=M,L&precio=50-80")))).toBe(3);
  });
});
