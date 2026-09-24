import { describe, expect, it } from "vitest";
import { addLine, cartTotals, MAX_UNITS_PER_LINE, reconcileCart, setLineQuantity, type CartLine } from "./cart";

const promo = { id: "p2x100", name: "2 X 100", quantity: 2, bundlePriceCents: 10000 };
const base: Omit<CartLine, "quantity"> = {
  variantId: "v1",
  productSlug: "pantalon-mom-jean",
  productName: "Pantalón Mom Jean",
  colorName: "Negro",
  sizeLabel: "30",
  image: "item/TMW-0137.webp",
  priceCents: 7000,
  compareAtPriceCents: 9900,
  stock: 3,
  promotion: promo,
};

describe("addLine", () => {
  it("suma unidades a la misma variante sin pasar del stock", () => {
    let lines = addLine([], base, 2);
    lines = addLine(lines, base, 5);
    expect(lines).toHaveLength(1);
    expect(lines[0].quantity).toBe(3);
  });

  it("no agrega variantes sin stock", () => {
    expect(addLine([], { ...base, stock: 0 }, 1)).toEqual([]);
  });

  it("respeta el máximo por línea", () => {
    expect(addLine([], { ...base, stock: 50 }, 99)[0].quantity).toBe(MAX_UNITS_PER_LINE);
  });
});

describe("setLineQuantity", () => {
  it("elimina la línea al llegar a cero", () => {
    const lines = addLine([], base, 1);
    expect(setLineQuantity(lines, "v1", 0)).toEqual([]);
    expect(setLineQuantity(lines, "v1", 2)[0].quantity).toBe(2);
  });
});

describe("reconcileCart", () => {
  it("quita lo que ya no se vende, ajusta al stock y avisa cambios de precio", () => {
    const lines: CartLine[] = [
      { ...base, quantity: 3 },
      { ...base, variantId: "v2", sizeLabel: "32", quantity: 1 },
      { ...base, variantId: "v3", sizeLabel: "34", quantity: 1 },
    ];
    const { lines: next, notices } = reconcileCart(lines, [
      { ...base, stock: 1, available: true },
      { ...base, variantId: "v2", sizeLabel: "32", priceCents: 6000, available: true },
      { ...base, variantId: "v3", sizeLabel: "34", available: false },
    ]);
    expect(next.map((l) => [l.variantId, l.quantity, l.priceCents])).toEqual([
      ["v1", 1, 7000],
      ["v2", 1, 6000],
    ]);
    expect(notices.map((n) => n.type)).toEqual(["reduced", "price", "removed"]);
  });
});

describe("cartTotals", () => {
  it("calcula unidades, subtotal y ahorro frente al precio anterior", () => {
    const lines = [{ ...base, quantity: 3 }];
    expect(cartTotals(lines)).toEqual({ units: 3, subtotalCents: 21000, savingsCents: 8700 });
  });
});
