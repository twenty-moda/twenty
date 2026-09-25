import { describe, expect, it } from "vitest";
import { IMAGE_SPECS, imageWarnings } from "./image-specs";
import { discountPercent, formatPrice } from "./money";
import { compareSizes } from "./sizes";
import { slugify } from "./slug";

describe("formatPrice", () => {
  it("muestra soles enteros sin decimales y con decimales cuando los hay", () => {
    expect(formatPrice(7000)).toBe("S/ 70");
    expect(formatPrice(6990)).toBe("S/ 69.90");
    expect(formatPrice(123456)).toBe("S/ 1,234.56");
    expect(formatPrice(-1500)).toBe("-S/ 15");
  });
});

describe("discountPercent", () => {
  it("calcula el porcentaje solo si el precio anterior es mayor", () => {
    expect(discountPercent(7000, 9900)).toBe(29);
    expect(discountPercent(7000, 7000)).toBeNull();
    expect(discountPercent(7000, null)).toBeNull();
  });
});

describe("compareSizes", () => {
  it("ordena letras de menor a mayor y luego números", () => {
    expect(["32", "L", "28", "XS", "M", "XL", "S", "30"].sort(compareSizes)).toEqual(["XS", "S", "M", "L", "XL", "28", "30", "32"]);
  });
});

describe("slugify", () => {
  it("quita tildes, espacios dobles y símbolos", () => {
    expect(slugify("Baggy Ángel  T-20")).toBe("baggy-angel-t-20");
    expect(slugify("  Súper Baggy / Negro ")).toBe("super-baggy-negro");
  });
});

describe("imageWarnings", () => {
  it("no avisa si la foto tiene la medida y la forma recomendadas (o es más grande)", () => {
    expect(imageWarnings({ width: 1200, height: 1600 }, IMAGE_SPECS.product)).toEqual([]);
    expect(imageWarnings({ width: 3000, height: 4000 }, IMAGE_SPECS.product)).toEqual([]);
  });

  it("avisa si es chica o si se va a recortar", () => {
    expect(imageWarnings({ width: 600, height: 800 }, IMAGE_SPECS.product)).toEqual([
      "Mide 600 × 800 px: puede verse borrosa. Lo ideal es 1200 × 1600 px.",
    ]);
    // El banner del inicio es vertical (foto del hero): una horizontal se recorta a los costados.
    expect(imageWarnings({ width: 2400, height: 1600 }, IMAGE_SPECS.bannerDesktop)).toEqual(["No es vertical 4:5: en la tienda se recortará a los costados."]);
    expect(imageWarnings({ width: 1200, height: 1200 }, IMAGE_SPECS.product)).toEqual(["No es vertical 3:4: en la tienda se recortará a los costados."]);
  });
});
