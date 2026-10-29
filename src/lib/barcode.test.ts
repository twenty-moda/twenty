import { describe, expect, it } from "vitest";
import { BarcodeError, CODE128_PATTERNS, code128Values, code128Widths } from "./barcode";

describe("Code 128", () => {
  it("la tabla no tiene errores: 11 módulos por símbolo (13 el stop), todos distintos", () => {
    expect(CODE128_PATTERNS).toHaveLength(107);
    CODE128_PATTERNS.forEach((p, value) => {
      const modules = [...p].reduce((s, d) => s + Number(d), 0);
      expect({ value, modules }).toEqual({ value, modules: value === 106 ? 13 : 11 });
    });
    expect(new Set(CODE128_PATTERNS).size).toBe(107);
  });

  it("calcula el dígito de control (ejemplo de la norma: PJJ123C)", () => {
    // 104 + 48·1 + 42·2 + 42·3 + 17·4 + 18·5 + 19·6 + 35·7 = 879 → 879 mod 103 = 55
    expect(code128Values("PJJ123C")).toEqual([104, 48, 42, 42, 17, 18, 19, 35, 55, 106]);
  });

  it("un SKU de TWENTY: start + 8 caracteres + control + stop", () => {
    const widths = code128Widths("TMW-0001");
    expect(widths.reduce((s, w) => s + w, 0)).toBe(11 * 10 + 13);
    expect(widths.slice(0, 6)).toEqual([2, 1, 1, 2, 1, 4]); // start B
    expect(widths.slice(-7)).toEqual([2, 3, 3, 1, 1, 1, 2]); // stop
  });

  it("rechaza textos que no se pueden codificar", () => {
    expect(() => code128Values("")).toThrow(BarcodeError);
    expect(() => code128Values("TALLA Ñ")).toThrow(BarcodeError);
  });
});
