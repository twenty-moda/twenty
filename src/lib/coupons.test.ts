import { describe, expect, it } from "vitest";
import { allocateCouponDiscount, couponDiscount, couponLabel, isValidCouponCode, normalizeCouponCode, type CouponRule } from "./coupons";

const rule = (overrides: Partial<CouponRule> = {}): CouponRule => ({
  code: "TWENTY10",
  type: "porcentaje",
  value: 10,
  maxDiscountCents: null,
  minSubtotalCents: 0,
  ...overrides,
});

describe("couponDiscount", () => {
  it("porcentaje sobre el total de las prendas, redondeado al céntimo", () => {
    expect(couponDiscount(rule(), 15000)).toBe(1500);
    expect(couponDiscount(rule({ value: 15 }), 6990)).toBe(1049);
  });
  it("porcentaje con tope", () => {
    expect(couponDiscount(rule({ value: 20, maxDiscountCents: 3000 }), 20000)).toBe(3000);
    expect(couponDiscount(rule({ value: 20, maxDiscountCents: 3000 }), 10000)).toBe(2000);
  });
  it("monto fijo", () => {
    expect(couponDiscount(rule({ type: "monto", value: 2000 }), 15000)).toBe(2000);
  });
  it("nunca descuenta más de lo que cuestan las prendas", () => {
    expect(couponDiscount(rule({ type: "monto", value: 5000 }), 3000)).toBe(3000);
    expect(couponDiscount(rule({ value: 100 }), 3000)).toBe(3000);
  });
  it("por debajo de la compra mínima no descuenta", () => {
    expect(couponDiscount(rule({ minSubtotalCents: 10000 }), 9990)).toBe(0);
    expect(couponDiscount(rule({ minSubtotalCents: 10000 }), 10000)).toBe(1000);
  });
});

describe("allocateCouponDiscount", () => {
  it("reparte según lo que cuesta cada línea y cuadra exacto", () => {
    const shares = allocateCouponDiscount(1000, [7000, 5000, 3000]);
    expect(shares.reduce((s, x) => s + x, 0)).toBe(1000);
    expect(shares).toEqual([467, 333, 200]);
  });
  it("sin descuento, todo en cero", () => {
    expect(allocateCouponDiscount(0, [7000, 5000])).toEqual([0, 0]);
  });
});

describe("códigos", () => {
  it("se guardan en mayúsculas y sin espacios alrededor", () => {
    expect(normalizeCouponCode("  twenty10 ")).toBe("TWENTY10");
  });
  it("letras, números y guiones; de 3 a 30", () => {
    expect(isValidCouponCode("TWENTY10")).toBe(true);
    expect(isValidCouponCode("BLACK-FRIDAY_2026")).toBe(true);
    expect(isValidCouponCode("AB")).toBe(false);
    expect(isValidCouponCode("CON ESPACIO")).toBe(false);
    expect(isValidCouponCode("-INICIO")).toBe(false);
    expect(isValidCouponCode("A".repeat(31))).toBe(false);
  });
  it("etiqueta: % o soles", () => {
    expect(couponLabel({ type: "porcentaje", value: 10 })).toBe("10%");
    expect(couponLabel({ type: "monto", value: 2000 })).toBe("S/ 20");
  });
});
