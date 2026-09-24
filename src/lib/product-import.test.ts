import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { readSheet } from "read-excel-file/node";
import { describe, expect, it } from "vitest";
import { parseMoney, parseProductSheet, TEMPLATE_COLUMNS, TEMPLATE_EXAMPLE } from "./product-import";

describe("parseMoney", () => {
  it("acepta números, S/ y coma decimal", () => {
    expect(parseMoney(70)).toBe(7000);
    expect(parseMoney("S/ 69,90")).toBe(6990);
    expect(parseMoney("")).toBeNull();
    expect(parseMoney("gratis")).toBeNull();
  });
});

describe("plantilla nueva", () => {
  it("lee las filas de ejemplo", () => {
    const { format, rows, issues } = parseProductSheet([[...TEMPLATE_COLUMNS], ...TEMPLATE_EXAMPLE]);
    expect(format).toBe("twenty");
    expect(issues).toEqual([]);
    expect(rows[0]).toMatchObject({ row: 2, product: "Baggy Ángel", category: "Pantalones", color: "Celeste", size: "28", sku: "TMW-0001", priceCents: 9900, stock: 5, visible: true });
    expect(rows[2]).toMatchObject({ sku: "", priceCents: 3000, compareAtCents: 4000 });
  });

  it("reporta filas incompletas y duplicadas con su número de fila", () => {
    const { rows, issues } = parseProductSheet([
      ["Producto", "Categoría", "Color", "Talla", "SKU", "Precio", "Stock"],
      ["Polo", "Polos", "Negro", "M", "A-1", 30, 2],
      ["Polo", "", "Negro", "L", "A-2", 30, 2],
      ["Polo", "Polos", "negro", "m", "A-3", 30, 2],
      ["Hoodie", "Hoodie", "Beige", "L", "A-1", 85, 1],
      [null, null, null],
      ["Jean", "Pantalones", "Azul", "30", "A-9", -5, 1],
    ]);
    expect(rows.map((r) => r.sku)).toEqual(["A-1"]);
    expect(issues).toEqual([
      { row: 3, message: "Falta: Categoría." },
      { row: 7, message: "El precio debe ser mayor que 0." },
      { row: 4, message: "Polo Negro talla M ya está en la fila 2." },
      { row: 5, message: "El SKU A-1 ya está en la fila 2." },
    ]);
  });

  it("avisa si faltan columnas obligatorias", () => {
    expect(parseProductSheet([["Producto", "Precio"]]).issues[0].message).toBe("Faltan columnas: Categoría, Color, Talla.");
  });
});

describe("plantilla anterior", () => {
  it("usa la fila maestro para la descripción y Atributos/Valores para color y talla", () => {
    const header = ["SKU", "Nombre del producto", "Categoría", "Subcategoría", "Precio", "Precio Descuento", "Descripción", "Stock", "Visible", "Es Maestro", "Atributos", "Valores"];
    const { format, rows } = parseProductSheet([
      header,
      ["TMW-0001", "Baggy Ángel", "PANTALONES", "BAGGY JEAN", 99, null, "Jean rígido", 0, "sí", "sí", null, null],
      ["TMW-0001", "Baggy Ángel - Celeste - 28", "PANTALONES", "BAGGY JEAN", 99, 75, null, 2, "sí", "no", "Género,Color,Talla", "HOMBRE,celeste,28"],
      ["TMW-0002", "Baggy Ángel - Negro - 30", "PANTALONES", "BAGGY JEAN", 99, null, null, 1, "no", "no", null, null],
    ]);
    expect(format).toBe("legacy");
    expect(rows).toEqual([
      expect.objectContaining({ sku: "TMW-0001", product: "Baggy Ángel", color: "Celeste", size: "28", priceCents: 7500, compareAtCents: 9900, description: "Jean rígido", stock: 2 }),
      expect.objectContaining({ sku: "TMW-0002", color: "Negro", size: "30", priceCents: 9900, visible: false }),
    ]);
  });

  const legacyFile = path.resolve(__dirname, "../../assets/images/repository/a6a4874e-a5d4-42e4-b297-ae7e2f75bd6b.xlsx");
  it.runIf(existsSync(legacyFile))("lee la plantilla real que usaba TWENTY", async () => {
    const sheet = await readSheet(readFileSync(legacyFile));
    const { format, rows, issues } = parseProductSheet(sheet);
    expect(format).toBe("legacy");
    expect(rows.length).toBeGreaterThan(150);
    expect(rows.every((r) => r.color && r.size && r.priceCents > 0)).toBe(true);
    // Los errores que queden deben ser duplicados reales de la planilla, no filas mal leídas.
    expect(issues.every((i) => /ya está en la fila/.test(i.message))).toBe(true);
  });
});
