import { describe, expect, it } from "vitest";
import { lineItem, variantLabel, type CartLine } from "./cart";
import { checkoutItemSchema } from "./checkout-schema";
import { allocateOutfitPrice, groupOrderItems, outfitLineKey, outfitStock, pieceLabel } from "./outfits";

describe("allocateOutfitPrice", () => {
  it("reparte el precio del conjunto según el precio de cada prenda y suma exacto", () => {
    expect(allocateOutfitPrice(11000, [6000, 7000])).toEqual([5077, 5923]);
    expect(allocateOutfitPrice(10000, [3333, 3333, 3334])).toEqual([3333, 3333, 3334]);
    for (const [price, pieces] of [
      [9999, [4000, 5000]],
      [12000, [3000, 3000, 3000, 3000]],
      [7000, [7000, 7000]],
    ] as [number, number[]][]) {
      expect(allocateOutfitPrice(price, pieces).reduce((a, b) => a + b, 0)).toBe(price);
    }
  });
});

describe("outfitStock", () => {
  it("alcanza lo que permite la pieza con menos stock (y la misma variante dos veces cuenta doble)", () => {
    expect(outfitStock([{ variantId: "a", stock: 5 }, { variantId: "b", stock: 2 }])).toBe(2);
    expect(outfitStock([{ variantId: "a", stock: 3 }, { variantId: "a", stock: 3 }])).toBe(1);
    expect(outfitStock([{ variantId: "a", stock: 0 }, { variantId: "b", stock: 9 }])).toBe(0);
  });
});

describe("pieceLabel", () => {
  it("usa el nombre escrito o el de la categoría con mayúscula inicial", () => {
    expect(pieceLabel("Pantalón", "PANTALONES")).toBe("Pantalón");
    expect(pieceLabel(null, "PANTALONES")).toBe("Pantalones");
    expect(pieceLabel("  ", "Camisa")).toBe("Camisa");
  });
});

describe("líneas de conjunto en el carrito", () => {
  const line: CartLine = {
    variantId: outfitLineKey("o1", ["v1", "v2"]),
    quantity: 2,
    productSlug: "conjunto-lino",
    productName: "Conjunto Lino",
    colorName: "",
    sizeLabel: "",
    image: null,
    priceCents: 11000,
    compareAtPriceCents: 13000,
    stock: 3,
    promotion: null,
    outfit: {
      id: "o1",
      pieces: [
        { variantId: "v1", label: "Camisa", productName: "Camisa Lino", productSlug: "camisa-lino", colorName: "Negro", sizeLabel: "M", image: null, priceCents: 6000, stock: 3 },
        { variantId: "v2", label: "Pantalón", productName: "Pantalón Lino", productSlug: "pantalon-lino", colorName: "Beige", sizeLabel: "30", image: null, priceCents: 7000, stock: 5 },
      ],
    },
  };

  it("muestra el color y la talla de cada pieza y manda al servidor las variantes en orden", () => {
    expect(variantLabel(line)).toBe("Camisa: Negro, talla M · Pantalón: Beige, talla 30");
    expect(lineItem(line)).toEqual({ outfitId: "o1", variantIds: ["v1", "v2"], quantity: 2 });
    expect(lineItem({ variantId: "v9", quantity: 1 })).toEqual({ variantId: "v9", quantity: 1 });
  });

  it("el checkout acepta prendas y conjuntos (de 2 a 4 piezas)", () => {
    const uuid = "a2aac749-6516-4a10-b780-8b07c8244413";
    expect(checkoutItemSchema.safeParse({ variantId: uuid, quantity: 1 }).success).toBe(true);
    expect(checkoutItemSchema.safeParse({ outfitId: uuid, variantIds: [uuid, uuid], quantity: 1 }).success).toBe(true);
    expect(checkoutItemSchema.safeParse({ outfitId: uuid, variantIds: [uuid], quantity: 1 }).success).toBe(false);
  });
});

describe("groupOrderItems", () => {
  const item = (id: string, over: Partial<{ outfitId: string; outfitName: string; outfitLine: number; totalCents: number }> = {}) => ({
    id,
    outfitId: null,
    outfitName: null,
    outfitLine: null,
    quantity: 1,
    totalCents: 5000,
    ...over,
  });

  it("junta las piezas de cada conjunto y deja las prendas sueltas aparte, en orden", () => {
    const groups = groupOrderItems([
      item("a"),
      item("b", { outfitId: "o1", outfitName: "Conjunto Lino", outfitLine: 1, totalCents: 5077 }),
      item("c", { outfitId: "o1", outfitName: "Conjunto Lino", outfitLine: 2, totalCents: 5077 }),
      item("d", { outfitId: "o1", outfitName: "Conjunto Lino", outfitLine: 1, totalCents: 5923 }),
    ]);
    expect(groups.map((g) => (g.kind === "single" ? g.item.id : g.items.map((i) => i.id).join("+")))).toEqual(["a", "b+d", "c"]);
    expect(groups[1]).toMatchObject({ kind: "outfit", name: "Conjunto Lino", totalCents: 11000 });
  });
});
