import { describe, expect, it } from "vitest";
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
