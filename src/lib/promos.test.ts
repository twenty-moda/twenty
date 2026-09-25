import { describe, expect, it } from "vitest";
import type { ProductCard } from "@/server/services/catalog";
import { promoSections } from "./promos";

function card(overrides: Partial<ProductCard> & Pick<ProductCard, "slug">): ProductCard {
  return {
    id: overrides.slug,
    name: overrides.slug,
    category: { slug: "pantalones", name: "Pantalones" },
    fit: null,
    priceCents: 7000,
    compareAtPriceCents: null,
    hasPriceRange: false,
    image: null,
    hoverImage: null,
    colors: [],
    sizes: ["M"],
    inStock: true,
    isFeatured: false,
    promotion: null,
    position: 0,
    outfit: null,
    ...overrides,
  };
}

const twoFor100 = { id: "p2", name: "2 X 100", quantity: 2, bundlePriceCents: 10000 };
const fourFor100 = { id: "p4", name: "POLOS4X100", quantity: 4, bundlePriceCents: 10000 };

describe("promoSections", () => {
  it("agrupa por promo en el orden del catálogo y separa las rebajas", () => {
    const sections = promoSections([
      card({ slug: "polo", promotion: fourFor100 }),
      card({ slug: "jacket", priceCents: 10000, compareAtPriceCents: 12500 }),
      card({ slug: "mom", promotion: twoFor100 }),
      card({ slug: "regular", promotion: twoFor100 }),
      card({ slug: "jort", priceCents: 7000, compareAtPriceCents: 8500 }),
      card({ slug: "baggy" }),
    ]);
    expect(sections.bundles.map((g) => [g.promotion.id, g.products.map((p) => p.slug)])).toEqual([
      ["p4", ["polo"]],
      ["p2", ["mom", "regular"]],
    ]);
    expect(sections.discounted.map((p) => p.slug)).toEqual(["jacket", "jort"]);
    expect(sections.maxDiscountPercent).toBe(20);
    expect(sections.productCount).toBe(5);
  });

  it("no muestra agotados ni repite una prenda que tiene promo y rebaja", () => {
    const sections = promoSections([
      card({ slug: "agotado", promotion: twoFor100, inStock: false, sizes: [] }),
      card({ slug: "agotado-rebajado", compareAtPriceCents: 9000, inStock: false, sizes: [] }),
      card({ slug: "ambas", promotion: twoFor100, compareAtPriceCents: 9000 }),
    ]);
    expect(sections.bundles.map((g) => g.products.map((p) => p.slug))).toEqual([["ambas"]]);
    expect(sections.discounted).toEqual([]);
    expect(sections.maxDiscountPercent).toBeNull();
    expect(sections.productCount).toBe(1);
  });

  it("sin promos ni rebajas queda vacío", () => {
    expect(promoSections([card({ slug: "baggy" })])).toEqual({ bundles: [], discounted: [], maxDiscountPercent: null, productCount: 0 });
  });
});
