import { describe, expect, it } from "vitest";
import { parseSizeGuide } from "./size-guide";

describe("parseSizeGuide", () => {
  it("lee el formato más común (una medida por línea)", () => {
    const table = parseSizeGuide("PANTALÓN ANGEL\n\nTALLA 28\nCintura: 80 cm\nTiro: 30 cm\nAncho:30 cm\n\nTALLA 30\nCintura: 82 cm\nTiro: 31 cm\nAncho: 32cm");
    expect(table?.title).toBe("PANTALÓN ANGEL");
    expect(table?.columns.map((c) => c.label)).toEqual(["Cintura", "Tiro", "Ancho"]);
    expect(table?.rows).toEqual([
      { size: "28", label: "28", values: { cintura: "80 cm", tiro: "30 cm", ancho: "30 cm" } },
      { size: "30", label: "30", values: { cintura: "82 cm", tiro: "31 cm", ancho: "32 cm" } },
    ]);
  });

  it("acepta la primera medida en la línea de la talla y medidas sin dos puntos ni unidad", () => {
    const table = parseSizeGuide("POLO 99 URBAN\n\nTALLA M: Largo: 69 cm\nAncho: 53 cm\n\n99 URBAN\n\nTALLA L:\nLargo: 72 cm\ncintura 87");
    expect(table?.rows.map((r) => [r.size, r.values])).toEqual([
      ["M", { largo: "69 cm", ancho: "53 cm" }],
      ["L", { largo: "72 cm", cintura: "87 cm" }],
    ]);
  });

  it("unifica nombres de medida escritos distinto y guarda las notas", () => {
    const table = parseSizeGuide("Puffer brillantes\nOjo: *SON TALLAS PEQUEÑAS*\n\nTalla XS🇵🇪- L🇨🇳\nCUELLO - MANGA:41 cm\nCintura: ELASTICO");
    expect(table?.notes).toEqual(["SON TALLAS PEQUEÑAS"]);
    expect(table?.columns).toEqual([
      { key: "cuello-manga", label: "Cuello-manga" },
      { key: "cintura", label: "Cintura" },
    ]);
    expect(table?.rows[0]).toMatchObject({ size: "XS", label: "XS 🇵🇪- L🇨🇳", values: { "cuello-manga": "41 cm", cintura: "Elástico" } });
  });

  it("separa el título pegado a la primera talla y ordena las tallas", () => {
    const table = parseSizeGuide("CAMISA BOXY BASICO: TALLA M\nLARGO:64 cm\n\nTALLA S:\nLARGO:61 cm");
    expect(table?.title).toBe("CAMISA BOXY BASICO");
    expect(table?.rows.map((r) => [r.size, r.values.largo])).toEqual([
      ["S", "61 cm"],
      ["M", "64 cm"],
    ]);
  });

  it("devuelve null si no hay tallas con medidas", () => {
    expect(parseSizeGuide("Material: Jean Rígido")).toBeNull();
    expect(parseSizeGuide(null)).toBeNull();
  });
});
