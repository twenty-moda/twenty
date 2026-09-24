import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  baseProductName,
  buildRedirectRules,
  normalizeInternalLink,
  stableUuid,
  titleCase,
  transformLegacyCatalog,
  type LegacyInput,
  type LegacyItem,
} from "./legacy";

const ATTR = { genero: "attr-genero", color: "attr-color", talla: "attr-talla" };
const CAT = { pantalones: "cat-pantalones", polos: "cat-polos", polo: "cat-polo" };
const FIT = { baggy: "fit-baggy", baggyDup: "fit-baggy-dup", test: "fit-test" };

function item(overrides: Partial<LegacyItem> & Pick<LegacyItem, "id" | "slug" | "name">): LegacyItem {
  return {
    agrupador: null,
    description: null,
    price: "70.00",
    final_price: "70.00",
    image: null,
    category_id: CAT.pantalones,
    subcategory_id: FIT.baggy,
    featured: "0",
    visible: "1",
    status: "1",
    sku: null,
    stock: "3",
    order_index: "0",
    created_at: "2026-09-04 12:00:00",
    meta_title: null,
    meta_description: null,
    ...overrides,
  };
}

function baseInput(overrides: Partial<LegacyInput> = {}): LegacyInput {
  return {
    items: [],
    attributes: [
      { id: ATTR.genero, slug: "genero" },
      { id: ATTR.color, slug: "color" },
      { id: ATTR.talla, slug: "talla" },
    ],
    itemAttributes: [],
    itemImages: [],
    itemSpecs: [],
    categories: [
      { id: CAT.pantalones, slug: "pantalones", name: "PANTALONES", image: null, order_index: "0", visible: "1", status: "1" },
      { id: CAT.polos, slug: "polos", name: "POLOS", image: null, order_index: "0", visible: "1", status: "1" },
      { id: CAT.polo, slug: "polo", name: "POLO", image: null, order_index: "0", visible: "1", status: "1" },
    ],
    subCategories: [
      { id: FIT.baggy, slug: "baggy-jean", name: "BAGGY JEAN", image: null, order_index: "0", visible: "1", status: "1" },
      { id: FIT.baggyDup, slug: "baggy-jean-1a2b3c4d", name: "BAGGY JEAN", image: "x.webp", order_index: "1", visible: "1", status: "1" },
      { id: FIT.test, slug: "sub-categoria-nueva", name: "Sub categoria nueva", image: null, order_index: "2", visible: "1", status: "0" },
    ],
    categorySubCategories: [],
    discountRules: [],
    sliders: [],
    generals: [],
    socials: [],
    stores: [],
    legacyUrlSlugs: [],
    ...overrides,
  };
}

const attrs = (itemId: string, color: string, talla: string) => [
  { item_id: itemId, attribute_id: ATTR.genero, value: "HOMBRE" },
  { item_id: itemId, attribute_id: ATTR.color, value: color },
  { item_id: itemId, attribute_id: ATTR.talla, value: talla },
];

/** Un producto con fila padre, dos colores y una variante duplicada con sufijo aleatorio en el slug. */
function baggyFixture(): LegacyInput {
  return baseInput({
    items: [
      item({ id: "p1", slug: "baggy-angel", name: "Baggy Ángel", agrupador: "TMW-0001", sku: "TMW-0001", image: "TMW-0001.webp", description: "Material: Jean Rígido" }),
      item({ id: "v1", slug: "baggy-angel-celeste-28", name: "Baggy Ángel - Celeste - 28", agrupador: "TMW-0001", sku: "TMW-0001", image: "TMW-0001.webp", price: "99.00", final_price: "75.00" }),
      item({ id: "v2", slug: "baggy-angel-celeste-30", name: "Baggy Ángel - Celeste - 30", agrupador: "TMW-0001", sku: "TMW-0002", image: "TMW-0002.webp", price: "99.00", final_price: "75.00" }),
      item({ id: "v3", slug: "baggy-angel-negro-28", name: "Baggy Ángel - Negro - 28", agrupador: "TMW-0001", sku: "TMW-0003", image: "TMW-0003.webp", stock: "0" }),
      // Duplicado de v1 creado después, sin agrupador y con sufijo aleatorio.
      item({ id: "v1dup", slug: "baggy-angel-celeste-28-a1b2c3d4", name: "Baggy Ángel - Celeste - 28", sku: "TMW-0001", image: "TMW-0001.webp", created_at: "2026-09-04 12:00:01" }),
    ],
    itemAttributes: [
      ...attrs("v1", "Celeste", "28"),
      ...attrs("v2", "celeste", "30"),
      ...attrs("v3", "Negro", "28"),
      ...attrs("v1dup", "Celeste", "28"),
      ...attrs("deleted-item", "Rojo", "40"),
    ],
    itemImages: [
      { item_id: "v1", url: "TMW-0001_02.webp", order: "0" },
      { item_id: "v1", url: "TMW-0001_01.webp", order: "0" },
      { item_id: "v2", url: "TMW-0002_01.webp", order: "0" },
    ],
    itemSpecs: [{ item_id: "v1", title: "BAGGY ANGEL\n\nTALLA 28\nCintura", description: "80 cm" }],
  });
}

// Las fotos de todas las tallas de un color son el mismo archivo con otro nombre.
const sameContent: Record<string, string> = {
  "TMW-0001.webp": "celeste-front",
  "TMW-0002.webp": "celeste-front",
  "TMW-0001_01.webp": "celeste-detail",
  "TMW-0002_01.webp": "celeste-detail",
  "TMW-0001_02.webp": "celeste-back",
  "TMW-0003.webp": "negro-front",
};
const fileHash = (filename: string) => sameContent[filename] ?? null;

describe("helpers", () => {
  it("quita el sufijo de color y talla del nombre", () => {
    expect(baseProductName("Polo  High Coton Ovebox - Marrón - S")).toBe("Polo High Coton Ovebox");
    expect(baseProductName("Baggy Clásico")).toBe("Baggy Clásico");
  });

  it("pone mayúscula inicial respetando tildes y separadores", () => {
    expect(titleCase("SÚPER BAGGY")).toBe("Súper Baggy");
    expect(titleCase("blanco/negro")).toBe("Blanco/Negro");
  });

  it("genera UUID deterministas y válidos", () => {
    const id = stableUuid("color", "negro");
    expect(id).toBe(stableUuid("color", "negro"));
    expect(id).not.toBe(stableUuid("color", "blanco"));
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("convierte enlaces absolutos del dominio en rutas internas", () => {
    expect(normalizeInternalLink("https://twentymoda.com/catalogo")).toBe("/catalogo");
    expect(normalizeInternalLink("/catalogo?category=jacket")).toBe("/catalogo?categoria=jacket");
    expect(normalizeInternalLink("https://instagram.com/x")).toBe("https://instagram.com/x");
  });
});

describe("transformLegacyCatalog", () => {
  it("agrupa variantes bajo un producto que conserva el ID y el slug de la fila padre", () => {
    const data = transformLegacyCatalog(baggyFixture(), { fileHash });
    expect(data.products).toHaveLength(1);
    const [product] = data.products;
    expect(product).toMatchObject({ id: "p1", slug: "baggy-angel", name: "Baggy Ángel", status: "active", description: "Material: Jean Rígido" });
    expect(product.sizeGuide).toBe("BAGGY ANGEL\n\nTALLA 28\nCintura: 80 cm");
  });

  it("unifica variantes duplicadas y conserva la de slug canónico", () => {
    const data = transformLegacyCatalog(baggyFixture(), { fileHash });
    expect(data.variants.map((v) => v.id).sort()).toEqual(["v1", "v2", "v3"]);
    expect(new Set(data.variants.map((v) => v.sku)).size).toBe(3);
    expect(data.report.some((line) => line.includes("1 variantes duplicadas"))).toBe(true);
  });

  it("guarda precio en céntimos y el precio anterior solo si hay descuento", () => {
    const data = transformLegacyCatalog(baggyFixture(), { fileHash });
    const v1 = data.variants.find((v) => v.id === "v1")!;
    const v3 = data.variants.find((v) => v.id === "v3")!;
    expect(v1).toMatchObject({ priceCents: 7500, compareAtPriceCents: 9900 });
    expect(v3).toMatchObject({ priceCents: 7000, compareAtPriceCents: null, stock: 0 });
  });

  it("normaliza colores con distinta grafía y ordena tallas", () => {
    const data = transformLegacyCatalog(baggyFixture(), { fileHash });
    expect(data.colors.map((c) => c.name)).toEqual(["Negro", "Celeste"]);
    expect(data.colors.find((c) => c.slug === "negro")?.hex).toBe("#000000");
    expect(data.sizes.map((s) => s.label)).toEqual(["28", "30"]);
  });

  it("asigna fotos por color sin repetir contenido entre tallas", () => {
    const data = transformLegacyCatalog(baggyFixture(), { fileHash });
    const celeste = data.colors.find((c) => c.slug === "celeste")!;
    const celesteImages = data.images.filter((i) => i.colorId === celeste.id).map((i) => i.path);
    expect(celesteImages).toEqual(["item/TMW-0001.webp", "item/TMW-0001_01.webp", "item/TMW-0001_02.webp"]);
    expect(data.images.filter((i) => i.colorId === null)).toHaveLength(0); // la foto del padre ya estaba
  });

  it("redirige los slugs anteriores al producto y a su variante", () => {
    const input = baggyFixture();
    input.legacyUrlSlugs = ["baggy-angel-negro-28-negro-28", "producto-descontinuado"];
    const data = transformLegacyCatalog(input, { fileHash });
    const bySlug = new Map(data.redirects.map((r) => [r.fromSlug, r]));
    expect(bySlug.get("baggy-angel-celeste-28")).toMatchObject({ productId: "p1", variantId: "v1" });
    expect(bySlug.get("baggy-angel-celeste-28-a1b2c3d4")).toMatchObject({ productId: "p1", variantId: "v1" });
    expect(bySlug.get("baggy-angel-negro-28-negro-28")).toMatchObject({ productId: "p1", variantId: "v3" });
    expect(bySlug.has("baggy-angel")).toBe(false);
    expect(bySlug.has("producto-descontinuado")).toBe(false);
  });

  it("genera reglas 308 con la variante preseleccionada", () => {
    const input = baggyFixture();
    input.legacyUrlSlugs = ["baggy-angel-negro-28-negro-28"];
    const rules = buildRedirectRules(transformLegacyCatalog(input, { fileHash }));
    expect(rules).toContainEqual({
      source: "/product/baggy-angel-negro-28-negro-28",
      destination: "/product/baggy-angel?color=negro&talla=28",
      permanent: true,
    });
    expect(rules.every((r) => r.source !== r.destination)).toBe(true);
  });

  it("unifica categorías y fits duplicados, y descarta los de prueba", () => {
    const input = baggyFixture();
    input.items.push(
      item({ id: "polo-a", slug: "polo-slim-fit-negro-m", name: "Polo Slim Fit - Negro - M", category_id: CAT.polos, subcategory_id: FIT.baggyDup, sku: "TMW-0311" }),
      item({ id: "polo-b", slug: "polo-slim-fit-negro-l", name: "Polo Slim Fit - Negro - L", category_id: CAT.polo, subcategory_id: FIT.baggyDup, sku: "TMW-0312" }),
    );
    input.itemAttributes.push(...attrs("polo-a", "Negro", "M"), ...attrs("polo-b", "Negro", "L"));
    const data = transformLegacyCatalog(input, { fileHash });

    expect(data.categories.map((c) => c.slug)).toEqual(["pantalones", "polos"]);
    expect(data.fits.map((f) => f.slug)).toEqual(["baggy-jean"]);
    const polo = data.products.find((p) => p.slug === "polo-slim-fit")!;
    expect(polo).toMatchObject({ categoryId: CAT.polos, fitId: FIT.baggy });
  });

  it("toma color y talla del nombre cuando faltan los atributos", () => {
    const input = baggyFixture();
    input.items.push(item({ id: "v4", slug: "baggy-angel-negro-30", name: "Baggy Ángel - Negro - 30", sku: "TMW-0004" }));
    const data = transformLegacyCatalog(input, { fileHash });
    expect(data.variants.find((v) => v.id === "v4")).toBeDefined();
  });

  it("renombra SKUs repetidos entre colores distintos y lo reporta", () => {
    const input = baggyFixture();
    input.items.push(item({ id: "v5", slug: "baggy-angel-plomo-28", name: "Baggy Ángel - Plomo - 28", sku: "TMW-0003" }));
    input.itemAttributes.push(...attrs("v5", "Plomo", "28"));
    const data = transformLegacyCatalog(input, { fileHash });
    expect(data.variants.find((v) => v.id === "v5")?.sku).toBe("TMW-0003-2");
    expect(data.report.some((line) => line.includes("SKU repetido TMW-0003"))).toBe(true);
  });

  it("convierte reglas de descuento por cantidad en precio por paquete", () => {
    const input = baggyFixture();
    input.discountRules = [
      {
        id: "rule-1",
        name: "2 X 100",
        description: "Lleva 2 por 100",
        active: "1",
        priority: "0",
        starts_at: null,
        ends_at: null,
        rule_type: "quantity_discount",
        conditions: JSON.stringify({ min_quantity: 2, product_ids: ["v3"], category_ids: [] }),
        actions: JSON.stringify({ discount_type: "fixed", discount_value: 20 }),
      },
    ];
    const data = transformLegacyCatalog(input, { fileHash });
    expect(data.promotions[0]).toMatchObject({ quantity: 2, bundlePriceCents: 10000, isActive: true });
    expect(data.promotionProducts).toEqual([{ promotionId: "rule-1", productId: "p1" }]);
  });

  it("deja en borrador un producto sin variantes activas", () => {
    const input = baggyFixture();
    for (const i of input.items) if (i.id !== "p1") i.visible = "0";
    const data = transformLegacyCatalog(input, { fileHash });
    expect(data.products[0].status).toBe("draft");
  });

  it("reporta fotos que no existen en assets", () => {
    const input = baggyFixture();
    input.items[1].image = "NO-EXISTE.webp";
    const data = transformLegacyCatalog(input, { fileHash });
    expect(data.report).toContain("Foto faltante: item/NO-EXISTE.webp (baggy-angel).");
  });
});

// Catálogo real exportado (sin datos personales). Verifica invariantes del resultado completo.
const ROOT = path.resolve(__dirname, "../../../..");
const hasExport = existsSync(path.join(ROOT, "db/catalog_json/items.json"));

describe.runIf(hasExport)("catálogo real (db/catalog_json)", () => {
  const read = (file: string) => JSON.parse(readFileSync(path.join(ROOT, file), "utf8"));
  const data = transformLegacyCatalog({
    items: read("db/catalog_json/items.json"),
    attributes: read("db/config_json/attributes.json"),
    itemAttributes: read("db/catalog_json/item_attribute.json"),
    itemImages: read("db/catalog_json/item_images.json"),
    itemSpecs: read("db/catalog_json/item_specifications.json"),
    categories: read("db/config_json/categories.json"),
    subCategories: read("db/config_json/sub_categories.json"),
    categorySubCategories: read("db/config_json/category_sub_category.json"),
    discountRules: read("db/config_json/discount_rules.json"),
    sliders: read("db/config_json/sliders.json"),
    generals: read("db/config_json/generals.json"),
    socials: read("db/config_json/socials.json"),
    stores: read("db/config_json/stores.json"),
    legacyUrlSlugs: [],
  });

  it("produce productos con slug único y al menos una variante activa si están publicados", () => {
    expect(data.products.length).toBeGreaterThan(30);
    expect(new Set(data.products.map((p) => p.slug)).size).toBe(data.products.length);
    for (const p of data.products.filter((x) => x.status === "active")) {
      expect(data.variants.some((v) => v.productId === p.id && v.isActive), p.slug).toBe(true);
    }
  });

  it("no deja SKUs repetidos ni combinaciones color/talla duplicadas", () => {
    expect(new Set(data.variants.map((v) => v.sku)).size).toBe(data.variants.length);
    const options = data.variants.map((v) => `${v.productId}|${v.colorId}|${v.sizeId}`);
    expect(new Set(options).size).toBe(options.length);
  });

  it("conserva los IDs de items como IDs de variante (los pedidos antiguos los referencian)", () => {
    const itemIds = new Set(read("db/catalog_json/items.json").map((i: { id: string }) => i.id));
    for (const v of data.variants) expect(itemIds.has(v.id)).toBe(true);
  });

  it("tiene precios entre S/ 30 y S/ 125 y stock no negativo", () => {
    for (const v of data.variants) {
      expect(v.priceCents).toBeGreaterThanOrEqual(3000);
      expect(v.priceCents).toBeLessThanOrEqual(12500);
      expect(v.stock).toBeGreaterThanOrEqual(0);
    }
  });

  it("convierte las 5 promociones N x S/ con su precio de paquete", () => {
    const labels = data.promotions.map((p) => `${p.quantity}x${p.bundlePriceCents / 100}`).sort();
    expect(labels).toEqual(["2x100", "2x100", "2x120", "4x100", "4x100"]);
  });
});
