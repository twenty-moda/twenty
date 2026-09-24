/**
 * Transforma el catálogo exportado de la plataforma anterior (db/catalog_json + db/config_json)
 * al modelo nuevo: producto → variantes (color + talla) → fotos por color.
 *
 * Funciones puras: no tocan la BD ni el disco (el hash de archivos se inyecta), así se pueden testear.
 * Cada decisión de limpieza queda registrada en `report` para revisarla con el equipo de TWENTY.
 */
import { createHash } from "node:crypto";
import { slugify } from "@/lib/slug";
import { compareSizes, sizeRank } from "@/lib/sizes";

// ─── Filas de entrada (todas las columnas llegan como string en el export) ───

type Flag = "0" | "1" | string;

export type LegacyItem = {
  id: string;
  slug: string;
  name: string;
  agrupador: string | null;
  description: string | null;
  price: string | null;
  final_price: string | null;
  image: string | null;
  category_id: string | null;
  subcategory_id: string | null;
  featured: Flag;
  visible: Flag;
  status: Flag;
  sku: string | null;
  stock: string | null;
  order_index: string | null;
  created_at: string | null;
  meta_title: string | null;
  meta_description: string | null;
};
export type LegacyAttribute = { id: string; slug: string };
export type LegacyItemAttribute = { item_id: string; attribute_id: string; value: string };
export type LegacyItemImage = { item_id: string; url: string; order: string | null };
export type LegacyItemSpec = { item_id: string; title: string | null; description: string | null };
export type LegacyTaxon = {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
  image: string | null;
  order_index: string | null;
  visible: Flag;
  status: Flag;
};
export type LegacyTaxonLink = { category_id: string; subcategory_id: string };
export type LegacyDiscountRule = {
  id: string;
  name: string;
  description: string | null;
  active: Flag;
  priority: string | null;
  starts_at: string | null;
  ends_at: string | null;
  rule_type: string;
  conditions: string;
  actions: string;
};
export type LegacySlider = {
  name: string;
  description: string | null;
  bg_image: string | null;
  bg_image_mobile: string | null;
  button_text: string | null;
  button_link: string | null;
  visible: Flag;
  status: Flag;
  order_index: string | null;
  is_seo: Flag;
  seo_h1: string | null;
};
export type LegacyGeneral = { correlative: string; description: string | null; status: Flag };
export type LegacySocial = { link: string; description: string | null; visible: Flag; status: Flag; order_index: string | null };
export type LegacyStore = {
  name: string;
  address: string | null;
  phone: string | null;
  ubigeo: string | null;
  latitude: string | null;
  longitude: string | null;
  business_hours: string | null;
};

export type LegacyTypeDelivery = { id: string; name: string; slug: string; description: string | null; characteristics: string | null };
export type LegacyDeliveryPrice = { ubigeo: string; name: string; is_express: Flag; express_price: string | null };

export type LegacyInput = {
  items: LegacyItem[];
  attributes: LegacyAttribute[];
  itemAttributes: LegacyItemAttribute[];
  itemImages: LegacyItemImage[];
  itemSpecs: LegacyItemSpec[];
  categories: LegacyTaxon[];
  subCategories: LegacyTaxon[];
  categorySubCategories: LegacyTaxonLink[];
  discountRules: LegacyDiscountRule[];
  sliders: LegacySlider[];
  generals: LegacyGeneral[];
  socials: LegacySocial[];
  stores: LegacyStore[];
  typesDelivery?: LegacyTypeDelivery[];
  deliveryPrices?: LegacyDeliveryPrice[];
  /** Slugs de producto de URLs públicas anteriores (sitemap.xml, products-feed.json). */
  legacyUrlSlugs: string[];
};

export type LegacyOptions = {
  /** Hash del contenido de un archivo de assets/images/item, o null si no existe. */
  fileHash?: (filename: string) => string | null;
};

// ─── Salida: filas listas para insertar ──────────────────────────────────────

export type SeedCategory = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  image: string | null;
  position: number;
  isVisible: boolean;
};
export type SeedFit = Omit<SeedCategory, "description">;
export type SeedColor = { id: string; slug: string; name: string; hex: string | null; position: number };
export type SeedSize = { id: string; label: string; position: number };
export type SeedProduct = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  sizeGuide: string | null;
  categoryId: string;
  fitId: string | null;
  gender: "hombre" | "mujer" | "unisex";
  status: "active" | "draft";
  isFeatured: boolean;
  position: number;
  metaTitle: string | null;
  metaDescription: string | null;
};
export type SeedVariant = {
  id: string;
  productId: string;
  sku: string;
  colorId: string;
  sizeId: string;
  priceCents: number;
  compareAtPriceCents: number | null;
  stock: number;
  isActive: boolean;
  position: number;
};
export type SeedImage = {
  id: string;
  productId: string;
  colorId: string | null;
  path: string;
  alt: string;
  position: number;
};
export type SeedRedirect = { fromSlug: string; productId: string; variantId: string | null };
export type SeedPromotion = {
  id: string;
  name: string;
  description: string | null;
  type: "bundle_price";
  quantity: number;
  bundlePriceCents: number;
  isActive: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
  priority: number;
};
export type SeedSlide = {
  id: string;
  title: string;
  description: string | null;
  image: string;
  imageMobile: string | null;
  href: string | null;
  ctaLabel: string | null;
  seoHeading: string | null;
  isVisible: boolean;
  position: number;
};

export type SeedShippingMethod = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  details: string[];
  kind: "lima_delivery" | "agency" | "store_pickup";
  paymentOnDelivery: boolean;
  isActive: boolean;
  position: number;
};
export type SeedDistrict = { ubigeo: string; name: string; province: string; department: string; deliveryPriceCents: number | null };

export type SeedData = {
  shippingMethods: SeedShippingMethod[];
  districts: SeedDistrict[];
  categories: SeedCategory[];
  fits: SeedFit[];
  categoryFits: { categoryId: string; fitId: string }[];
  colors: SeedColor[];
  sizes: SeedSize[];
  products: SeedProduct[];
  variants: SeedVariant[];
  images: SeedImage[];
  redirects: SeedRedirect[];
  promotions: SeedPromotion[];
  promotionProducts: { promotionId: string; productId: string }[];
  slides: SeedSlide[];
  settings: { key: string; value: unknown }[];
  report: string[];
};

// ─── Utilidades ──────────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Slugs que la plataforma anterior generó con sufijo aleatorio: "chompa-punto-fino-negro-m-a127af5b". */
const RANDOM_SUFFIX_RE = /-[0-9a-f]{8}$/;

/** UUID determinista: correr el seed dos veces produce los mismos IDs. */
export function stableUuid(namespace: string, key: string): string {
  const hex = createHash("sha1").update(`${namespace}:${key}`).digest("hex");
  const variant = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

const isOn = (flag: Flag | null | undefined) => flag === "1";
const toInt = (value: string | null | undefined, fallback = 0) => {
  const n = Number.parseInt(value ?? "", 10);
  return Number.isFinite(n) ? n : fallback;
};
const toCents = (value: string | null | undefined) => {
  const n = Number.parseFloat(value ?? "");
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};
const cleanText = (value: string | null | undefined) => {
  const text = (value ?? "")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text || null;
};
const collapse = (value: string) => value.replace(/\s+/g, " ").trim();

/** "ZIP HOODIE" → "Zip Hoodie", "SÚPER BAGGY" → "Súper Baggy". */
export function titleCase(value: string): string {
  return collapse(value)
    .toLocaleLowerCase("es")
    .replace(/(^|[\s/-])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toLocaleUpperCase("es"));
}

/** Nombre del producto sin el sufijo " - Color - Talla" que se agregaba a cada variante. */
export function baseProductName(name: string): string {
  return collapse(name.split(/\s+-\s+/)[0] ?? name);
}

function mode<T>(values: T[]): T | undefined {
  const counts = new Map<T, number>();
  let best: T | undefined;
  let bestCount = 0;
  for (const v of values) {
    const c = (counts.get(v) ?? 0) + 1;
    counts.set(v, c);
    if (c > bestCount) {
      best = v;
      bestCount = c;
    }
  }
  return best;
}

function uniqueSlug(base: string, taken: Set<string>): string {
  let slug = base;
  for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
  taken.add(slug);
  return slug;
}

const hasDiacritics = (s: string) => s.normalize("NFD") !== s;

/** De varias grafías del mismo color ("Maiz", "Maíz", "maiz") elige la más usada, prefiriendo tildes. */
function pickColorName(spellings: string[]): string {
  const counts = new Map<string, number>();
  for (const s of spellings) counts.set(titleCase(s), (counts.get(titleCase(s)) ?? 0) + 1);
  return [...counts.entries()].sort(
    (a, b) => Number(hasDiacritics(b[0])) - Number(hasDiacritics(a[0])) || b[1] - a[1],
  )[0][0];
}

const COLOR_HEX: Record<string, string> = {
  negro: "#000000",
  "total-black": "#000000",
  blanco: "#ffffff",
  beige: "#d8c8a8",
  plomo: "#6f7072",
  plata: "#c4c6c8",
  perla: "#e9e4d8",
  marron: "#6b4a2f",
  rosa: "#f1b9c8",
  celeste: "#9fc9e3",
  hueso: "#efe7d4",
  arena: "#d6c29c",
  topo: "#877a6a",
  carbon: "#3a3a3a",
};

/** Categorías duplicadas en la plataforma anterior (misma categoría con dos nombres). */
const CATEGORY_ALIASES: Record<string, string> = { polo: "polos" };

// ─── Transformación ──────────────────────────────────────────────────────────

export function transformLegacyCatalog(input: LegacyInput, options: LegacyOptions = {}): SeedData {
  const report: string[] = [];
  const fileHash = options.fileHash ?? ((filename: string) => filename);

  // Categorías: se unifican alias (POLO → POLOS) y se corrigen slugs que eran UUID.
  const categoryIdMap = new Map<string, string>();
  const categoriesByKey = new Map<string, SeedCategory>();
  const categorySlugs = new Set<string>();
  for (const c of input.categories) {
    const nameKey = slugify(c.name);
    const key = CATEGORY_ALIASES[nameKey] ?? nameKey;
    const existing = categoriesByKey.get(key);
    if (existing) {
      categoryIdMap.set(c.id, existing.id);
      report.push(`Categoría "${c.name}" unificada con "${existing.name}".`);
      continue;
    }
    const rawSlug = c.slug && !UUID_RE.test(c.slug) ? c.slug : key;
    if (rawSlug !== c.slug) report.push(`Categoría "${c.name}": slug "${c.slug}" reemplazado por "${rawSlug}".`);
    const category: SeedCategory = {
      id: c.id,
      slug: uniqueSlug(rawSlug, categorySlugs),
      name: titleCase(c.name),
      description: cleanText(c.description),
      image: c.image ? `category/${c.image}` : null,
      position: toInt(c.order_index),
      isVisible: isOn(c.visible) && isOn(c.status),
    };
    categoriesByKey.set(key, category);
    categoryIdMap.set(c.id, c.id);
  }

  // Fits (subcategorías): se unifican por nombre ("BOXI FIT" existía 3 veces) y se descartan las de prueba.
  const fitIdMap = new Map<string, string>();
  const fitsByKey = new Map<string, SeedFit>();
  const fitSlugs = new Set<string>();
  for (const s of input.subCategories) {
    if (!isOn(s.status)) {
      report.push(`Subcategoría "${s.name}" descartada (inactiva).`);
      continue;
    }
    const key = slugify(s.name);
    const existing = fitsByKey.get(key);
    if (existing) {
      fitIdMap.set(s.id, existing.id);
      if (!existing.image && s.image) existing.image = `sub_category/${s.image}`;
      report.push(`Subcategoría "${s.name}" (${s.slug}) unificada con "${existing.slug}".`);
      continue;
    }
    const fit: SeedFit = {
      id: s.id,
      slug: uniqueSlug(key, fitSlugs),
      name: titleCase(s.name),
      image: s.image ? `sub_category/${s.image}` : null,
      position: toInt(s.order_index),
      isVisible: isOn(s.visible),
    };
    fitsByKey.set(key, fit);
    fitIdMap.set(s.id, s.id);
  }

  // Atributos por item (Color / Talla / Género). Se ignoran filas de items que ya no existen.
  const attrSlugById = new Map(input.attributes.map((a) => [a.id, a.slug]));
  const itemIds = new Set(input.items.map((i) => i.id));
  const attrsByItem = new Map<string, Record<string, string>>();
  let orphanAttributes = 0;
  for (const row of input.itemAttributes) {
    if (!itemIds.has(row.item_id)) {
      orphanAttributes++;
      continue;
    }
    const slug = attrSlugById.get(row.attribute_id);
    if (!slug) continue;
    const attrs = attrsByItem.get(row.item_id) ?? {};
    attrs[slug] = collapse(row.value);
    attrsByItem.set(row.item_id, attrs);
  }
  if (orphanAttributes) report.push(`${orphanAttributes} filas de item_attribute de items borrados ignoradas.`);

  // Color y talla de cada variante. Si faltan los atributos, se leen del nombre ("Hoodie Moon - Beige - M").
  const optionsByItem = new Map<string, { color: string; talla: string; genero?: string }>();
  for (const item of input.items) {
    const attrs = attrsByItem.get(item.id) ?? {};
    const [, nameColor, nameSize, ...extra] = item.name.split(/\s+-\s+/);
    const fromName = extra.length === 0 && nameColor && nameSize ? { color: collapse(nameColor), talla: collapse(nameSize) } : null;
    if (attrs.color && attrs.talla) {
      optionsByItem.set(item.id, { color: attrs.color, talla: attrs.talla, genero: attrs.genero });
    } else if (fromName) {
      optionsByItem.set(item.id, { ...fromName, genero: attrs.genero });
      report.push(`Item ${item.sku} (${item.slug}): color y talla tomados del nombre (faltaban atributos).`);
    } else if (attrsByItem.has(item.id)) {
      report.push(`Item ${item.sku} (${item.slug}) con atributos incompletos y sin color/talla en el nombre: no se migra como variante.`);
    }
  }

  const galleryByItem = new Map<string, LegacyItemImage[]>();
  for (const img of input.itemImages) {
    const list = galleryByItem.get(img.item_id) ?? [];
    list.push(img);
    galleryByItem.set(img.item_id, list);
  }
  for (const list of galleryByItem.values()) {
    list.sort((a, b) => toInt(a.order) - toInt(b.order) || a.url.localeCompare(b.url));
  }

  const specsByItem = new Map<string, string>();
  for (const spec of input.itemSpecs) {
    // El export partió el texto en el primer ":" (título = "…TALLA 28\nCintura"); se vuelve a unir.
    const text = cleanText([spec.title, spec.description].filter(Boolean).join(": "));
    if (text) specsByItem.set(spec.item_id, text);
  }

  // Agrupación: el nombre base es más confiable que `agrupador` (hay grupos partidos, mezclados o vacíos).
  const groups = new Map<string, LegacyItem[]>();
  for (const item of input.items) {
    const key = slugify(baseProductName(item.name));
    const list = groups.get(key) ?? [];
    list.push(item);
    groups.set(key, list);
  }

  const colorSpellings = new Map<string, string[]>();
  const sizeLabels = new Set<string>();
  const productSlugs = new Set<string>();
  const products: SeedProduct[] = [];
  const itemToProduct = new Map<string, string>();

  type DraftVariant = { item: LegacyItem; colorKey: string; sizeLabel: string };
  const draftsByProduct = new Map<string, DraftVariant[]>();
  const rowsByProduct = new Map<string, LegacyItem[]>();

  for (const [key, rows] of groups) {
    // Fila "padre" = la ficha general del producto (sin color ni talla), no se vende.
    const parents = rows.filter((r) => !optionsByItem.has(r.id) && !attrsByItem.has(r.id));
    const parent = parents.find((p) => isOn(p.visible) && isOn(p.status)) ?? parents[0];
    const variantRows = rows.filter((r) => optionsByItem.has(r.id));

    const productId = parent?.id ?? stableUuid("product", key);
    const baseSlug = parent && !RANDOM_SUFFIX_RE.test(parent.slug) ? parent.slug : key;
    const slug = uniqueSlug(baseSlug, productSlugs);
    const categoryId = mode(rows.map((r) => categoryIdMap.get(r.category_id ?? "")).filter((v): v is string => !!v));
    if (!categoryId) {
      report.push(`Producto "${key}" descartado: sin categoría válida.`);
      continue;
    }
    const fitId = mode(rows.map((r) => fitIdMap.get(r.subcategory_id ?? "")).filter((v): v is string => !!v)) ?? null;
    const name = parent ? collapse(parent.name) : baseProductName(variantRows[0]?.name ?? key);
    const sizeGuide = mode(rows.map((r) => specsByItem.get(r.id)).filter((v): v is string => !!v)) ?? null;

    products.push({
      id: productId,
      slug,
      name,
      description: cleanText(parent?.description) ?? mode(rows.map((r) => cleanText(r.description)).filter((v): v is string => !!v)) ?? null,
      sizeGuide,
      categoryId,
      fitId,
      gender: "hombre",
      status: "draft", // se decide abajo, cuando se conocen sus variantes activas
      isFeatured: rows.some((r) => isOn(r.featured)),
      position: toInt(parent?.order_index ?? variantRows[0]?.order_index),
      metaTitle: cleanText(parent?.meta_title),
      metaDescription: cleanText(parent?.meta_description),
    });
    for (const r of rows) itemToProduct.set(r.id, productId);
    rowsByProduct.set(productId, rows);
    if (parents.length > 1) report.push(`Producto "${slug}": ${parents.length} filas padre, se usó ${parent?.slug}.`);

    const drafts: DraftVariant[] = [];
    for (const item of variantRows) {
      const attrs = optionsByItem.get(item.id)!;
      if (attrs.genero && slugify(attrs.genero) !== "hombre") {
        report.push(`Item ${item.sku}: género "${attrs.genero}" (se asumió hombre para todo el catálogo).`);
      }
      const colorKey = slugify(attrs.color);
      const sizeLabel = attrs.talla.toUpperCase();
      colorSpellings.set(colorKey, [...(colorSpellings.get(colorKey) ?? []), attrs.color]);
      sizeLabels.add(sizeLabel);
      drafts.push({ item, colorKey, sizeLabel });
    }
    // Prioridad ante duplicados: slug canónico, mismo agrupador que el padre, más antiguo.
    drafts.sort(
      (a, b) =>
        Number(RANDOM_SUFFIX_RE.test(a.item.slug)) - Number(RANDOM_SUFFIX_RE.test(b.item.slug)) ||
        Number(a.item.agrupador !== parent?.agrupador) - Number(b.item.agrupador !== parent?.agrupador) ||
        (a.item.created_at ?? "").localeCompare(b.item.created_at ?? "") ||
        (a.item.sku ?? "").localeCompare(b.item.sku ?? ""),
    );
    draftsByProduct.set(productId, drafts);
  }

  // Colores y tallas globales.
  const colors: SeedColor[] = [...colorSpellings.entries()]
    .map(([slug, spellings]) => ({ slug, name: pickColorName(spellings) }))
    .sort((a, b) => {
      const pin = (s: string) => (s === "negro" ? 0 : s === "blanco" ? 1 : 2);
      return pin(a.slug) - pin(b.slug) || a.name.localeCompare(b.name, "es");
    })
    .map((c, position) => ({ id: stableUuid("color", c.slug), ...c, hex: COLOR_HEX[c.slug] ?? null, position }));
  const colorBySlug = new Map(colors.map((c) => [c.slug, c]));
  const sizes: SeedSize[] = [...sizeLabels]
    .sort(compareSizes)
    .map((label) => ({ id: stableUuid("size", label), label, position: sizeRank(label) }));
  const sizeByLabel = new Map(sizes.map((s) => [s.label, s]));

  // Variantes, fotos y redirecciones.
  const variants: SeedVariant[] = [];
  const images: SeedImage[] = [];
  const redirects: SeedRedirect[] = [];
  const redirectSlugs = new Set<string>();
  const skus = new Set<string>();
  const productById = new Map(products.map((p) => [p.id, p]));
  const variantByItem = new Map<string, string>();
  let duplicateRows = 0;
  let missingFiles = 0;

  for (const product of products) {
    const drafts = draftsByProduct.get(product.id) ?? [];
    const chosen = new Map<string, DraftVariant>();
    for (const d of drafts) {
      const optionKey = `${d.colorKey}|${d.sizeLabel}`;
      const kept = chosen.get(optionKey);
      if (kept) {
        duplicateRows++;
        variantByItem.set(d.item.id, kept.item.id);
        continue;
      }
      chosen.set(optionKey, d);
    }

    const ordered = [...chosen.values()].sort(
      (a, b) =>
        (colorBySlug.get(a.colorKey)?.position ?? 0) - (colorBySlug.get(b.colorKey)?.position ?? 0) ||
        compareSizes(a.sizeLabel, b.sizeLabel),
    );
    ordered.forEach((d, position) => {
      const priceCents = toCents(d.item.final_price) || toCents(d.item.price);
      const listCents = toCents(d.item.price);
      let sku = collapse(d.item.sku ?? "") || `TMW-${d.item.id.slice(0, 8)}`;
      if (skus.has(sku)) {
        const original = sku;
        for (let n = 2; skus.has(sku); n++) sku = `${original}-${n}`;
        report.push(`SKU repetido ${original} en "${product.slug}" (${d.colorKey} ${d.sizeLabel}): se guardó como ${sku}. Revisar color/foto.`);
      }
      skus.add(sku);
      variants.push({
        id: d.item.id,
        productId: product.id,
        sku,
        colorId: colorBySlug.get(d.colorKey)!.id,
        sizeId: sizeByLabel.get(d.sizeLabel)!.id,
        priceCents,
        compareAtPriceCents: listCents > priceCents ? listCents : null,
        stock: Math.max(0, toInt(d.item.stock)),
        isActive: isOn(d.item.visible) && isOn(d.item.status),
        position,
      });
      variantByItem.set(d.item.id, d.item.id);
    });

    const hasActiveVariant = variants.some((v) => v.productId === product.id && v.isActive);
    const parentRow = (rowsByProduct.get(product.id) ?? []).find((r) => r.id === product.id);
    const parentVisible = parentRow ? isOn(parentRow.visible) && isOn(parentRow.status) : true;
    product.status = hasActiveVariant && parentVisible ? "active" : "draft";
    if (!hasActiveVariant) report.push(`Producto "${product.slug}" queda en borrador: no tiene variantes activas.`);

    // Fotos por color: todas las filas de ese color, sin repetir contenido (las tallas comparten foto).
    const seenHashes = new Set<string>();
    const pushImage = (filename: string | null, colorId: string | null, colorName: string | null) => {
      if (!filename) return;
      const hash = fileHash(filename);
      if (hash === null) {
        missingFiles++;
        report.push(`Foto faltante: item/${filename} (${product.slug}).`);
        return;
      }
      if (seenHashes.has(hash)) return;
      seenHashes.add(hash);
      images.push({
        id: stableUuid("image", `${product.id}:${filename}`),
        productId: product.id,
        colorId,
        path: `item/${filename}`,
        alt: colorName ? `${product.name} - ${colorName}` : product.name,
        position: images.filter((i) => i.productId === product.id && i.colorId === colorId).length,
      });
    };
    for (const colorKey of new Set(ordered.map((d) => d.colorKey))) {
      const color = colorBySlug.get(colorKey)!;
      for (const row of drafts.filter((x) => x.colorKey === colorKey)) {
        pushImage(row.item.image, color.id, color.name);
        for (const g of galleryByItem.get(row.item.id) ?? []) pushImage(g.url, color.id, color.name);
      }
    }
    if (parentRow) {
      pushImage(parentRow.image, null, null);
      for (const g of galleryByItem.get(parentRow.id) ?? []) pushImage(g.url, null, null);
    }

    for (const row of rowsByProduct.get(product.id) ?? []) {
      if (row.slug === product.slug || productSlugs.has(row.slug) || redirectSlugs.has(row.slug)) continue;
      redirectSlugs.add(row.slug);
      redirects.push({ fromSlug: row.slug, productId: product.id, variantId: variantByItem.get(row.id) ?? null });
    }
  }
  if (duplicateRows) report.push(`${duplicateRows} variantes duplicadas (mismo producto, color y talla) unificadas.`);
  if (missingFiles) report.push(`${missingFiles} referencias a fotos que no están en assets/images/item.`);

  // URLs públicas de la plataforma anterior que ya no existen: se redirigen al producto por prefijo.
  const productsBySlugLength = [...products].sort((a, b) => b.slug.length - a.slug.length);
  let unmatchedUrls = 0;
  for (const legacySlug of input.legacyUrlSlugs) {
    if (productSlugs.has(legacySlug) || redirectSlugs.has(legacySlug)) continue;
    const product = productsBySlugLength.find((p) => legacySlug.startsWith(`${p.slug}-`));
    if (!product) {
      unmatchedUrls++;
      report.push(`URL anterior /product/${legacySlug} sin producto equivalente.`);
      continue;
    }
    const rest = legacySlug.slice(product.slug.length + 1);
    const variant = variants.find((v) => {
      if (v.productId !== product.id) return false;
      const color = colors.find((c) => c.id === v.colorId)!;
      const size = sizes.find((s) => s.id === v.sizeId)!;
      return rest.startsWith(`${color.slug}-${size.label.toLowerCase()}`);
    });
    redirectSlugs.add(legacySlug);
    redirects.push({ fromSlug: legacySlug, productId: product.id, variantId: variant?.id ?? null });
  }
  if (unmatchedUrls) report.push(`${unmatchedUrls} URLs anteriores sin producto equivalente (quedan en 404).`);

  // En la plataforma anterior todas las posiciones eran 0: se ordena por cantidad de productos activos.
  const activeCount = (pick: (p: SeedProduct) => string | null) => {
    const counts = new Map<string, number>();
    for (const p of products) if (p.status === "active") counts.set(pick(p) ?? "", (counts.get(pick(p) ?? "") ?? 0) + 1);
    return counts;
  };
  const byPopularity = <T extends { id: string; name: string; position: number }>(list: T[], counts: Map<string, number>) =>
    list
      .sort((a, b) => a.position - b.position || (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0) || a.name.localeCompare(b.name, "es"))
      .map((item, position) => ({ ...item, position }));
  const categories = byPopularity([...categoriesByKey.values()], activeCount((p) => p.categoryId));
  const fits = byPopularity([...fitsByKey.values()], activeCount((p) => p.fitId));

  // Relación categoría ↔ fit: la declarada y la que usan los productos.
  const categoryFitKeys = new Set<string>();
  for (const link of input.categorySubCategories) {
    const categoryId = categoryIdMap.get(link.category_id);
    const fitId = fitIdMap.get(link.subcategory_id);
    if (categoryId && fitId) categoryFitKeys.add(`${categoryId}|${fitId}`);
  }
  for (const p of products) if (p.fitId) categoryFitKeys.add(`${p.categoryId}|${p.fitId}`);
  const categoryFits = [...categoryFitKeys].map((k) => {
    const [categoryId, fitId] = k.split("|");
    return { categoryId, fitId };
  });

  // Promociones "N x S/": la regla anterior guardaba un descuento fijo por unidad sobre un precio común.
  const promotions: SeedPromotion[] = [];
  const promotionProducts: { promotionId: string; productId: string }[] = [];
  const itemsById = new Map(input.items.map((i) => [i.id, i]));
  for (const rule of input.discountRules) {
    if (rule.rule_type !== "quantity_discount") {
      report.push(`Regla "${rule.name}" (${rule.rule_type}) no migrada: tipo no soportado.`);
      continue;
    }
    const conditions = JSON.parse(rule.conditions || "{}") as { min_quantity?: number; product_ids?: string[]; category_ids?: string[] };
    const actions = JSON.parse(rule.actions || "{}") as { discount_type?: string; discount_value?: number };
    const quantity = Number(conditions.min_quantity ?? 0);
    const referenced = (conditions.product_ids ?? []).map((id) => itemsById.get(id)).filter((i): i is LegacyItem => !!i);
    const unitCents = mode(referenced.map((i) => toCents(i.final_price) || toCents(i.price)));
    if (!quantity || !unitCents) {
      report.push(`Regla "${rule.name}" no migrada: sin cantidad o productos.`);
      continue;
    }
    if (conditions.category_ids?.length) report.push(`Regla "${rule.name}": filtro por categoría ignorado.`);
    const value = Number(actions.discount_value ?? 0);
    const unitAfter =
      actions.discount_type === "percentage" ? Math.round(unitCents * (1 - value / 100)) : unitCents - Math.round(value * 100);
    const prices = new Set(referenced.map((i) => toCents(i.final_price) || toCents(i.price)));
    if (prices.size > 1) report.push(`Regla "${rule.name}": productos con precios distintos, se usó ${unitCents / 100} como base.`);

    promotions.push({
      id: rule.id,
      name: collapse(rule.name),
      description: cleanText(rule.description),
      type: "bundle_price",
      quantity,
      bundlePriceCents: quantity * unitAfter,
      isActive: isOn(rule.active),
      startsAt: rule.starts_at ? new Date(rule.starts_at) : null,
      endsAt: rule.ends_at ? new Date(rule.ends_at) : null,
      priority: toInt(rule.priority),
    });
    const productIds = new Set(referenced.map((i) => itemToProduct.get(i.id)).filter((v): v is string => !!v && productById.has(v)));
    for (const productId of productIds) promotionProducts.push({ promotionId: rule.id, productId });
  }

  // Banners del home.
  const slides: SeedSlide[] = input.sliders
    .filter((s) => isOn(s.status) && s.bg_image)
    .map((s, i) => ({
      id: stableUuid("slide", `${i}:${s.bg_image}`),
      title: collapse(s.name),
      description: cleanText(s.description),
      image: `slider/${s.bg_image}`,
      imageMobile: s.bg_image_mobile ? `slider/${s.bg_image_mobile}` : null,
      href: normalizeInternalLink(s.button_link),
      ctaLabel: cleanText(s.button_text),
      seoHeading: isOn(s.is_seo) ? cleanText(s.seo_h1) : null,
      isVisible: isOn(s.visible),
      position: toInt(s.order_index),
    }));

  const settingsList = buildSettings(input, report);
  const { shippingMethods, districts } = buildShipping(input, report);

  return {
    shippingMethods,
    districts,
    categories,
    fits,
    categoryFits,
    colors,
    sizes,
    products,
    variants,
    images,
    redirects,
    promotions,
    promotionProducts,
    slides,
    settings: settingsList,
    report,
  };
}

/**
 * Reglas de redirección 308 para next.config.ts (se aplican en el borde, sin tocar la BD).
 * Una URL de variante antigua lleva al producto con ese color y talla ya elegidos.
 */
export function buildRedirectRules(data: Pick<SeedData, "redirects" | "products" | "variants" | "colors" | "sizes">) {
  const products = new Map(data.products.filter((p) => p.status === "active").map((p) => [p.id, p]));
  const variants = new Map(data.variants.map((v) => [v.id, v]));
  const colors = new Map(data.colors.map((c) => [c.id, c]));
  const sizes = new Map(data.sizes.map((s) => [s.id, s]));
  return data.redirects
    .filter((r) => products.has(r.productId))
    .map((r) => {
      const product = products.get(r.productId)!;
      const variant = r.variantId ? variants.get(r.variantId) : undefined;
      const query = variant ? `?color=${colors.get(variant.colorId)!.slug}&talla=${sizes.get(variant.sizeId)!.label}` : "";
      return { source: `/product/${r.fromSlug}`, destination: `/product/${product.slug}${query}`, permanent: true };
    })
    .sort((a, b) => a.source.localeCompare(b.source));
}

/** Tipos de envío anteriores → métodos nuevos. "Envío gratis" era "manda tu motorizado a la tienda": va dentro de recojo. */
const SHIPPING_BY_LEGACY_SLUG: Record<string, Pick<SeedShippingMethod, "slug" | "name" | "kind" | "paymentOnDelivery" | "position"> | null> = {
  "delivery-express": { slug: "delivery-lima", name: "Delivery Lima", kind: "lima_delivery", paymentOnDelivery: false, position: 0 },
  "delivery-normal": { slug: "shalom", name: "Envío Shalom", kind: "agency", paymentOnDelivery: true, position: 1 },
  "delivery-agencia": { slug: "olva", name: "Envío Olva", kind: "agency", paymentOnDelivery: true, position: 2 },
  "retiro-en-tienda": { slug: "recojo-en-tienda", name: "Recojo en tienda", kind: "store_pickup", paymentOnDelivery: false, position: 3 },
  "envio-gratis": null,
};

function buildShipping(input: LegacyInput, report: string[]) {
  const shippingMethods: SeedShippingMethod[] = [];
  for (const t of input.typesDelivery ?? []) {
    const target = SHIPPING_BY_LEGACY_SLUG[t.slug];
    if (target === undefined) {
      report.push(`Tipo de envío "${t.name}" no reconocido: no se migró.`);
      continue;
    }
    if (target === null) {
      report.push(`Tipo de envío "${t.name}" (manda tu motorizado) se ofrece dentro de "Recojo en tienda".`);
      continue;
    }
    let details: string[] = [];
    try {
      details = (JSON.parse(t.characteristics ?? "[]") as string[]).map(collapse).filter(Boolean);
    } catch {
      details = [];
    }
    shippingMethods.push({
      id: t.id,
      ...target,
      description: cleanText(t.description),
      details,
      isActive: true,
    });
  }
  shippingMethods.sort((a, b) => a.position - b.position);

  const districts: SeedDistrict[] = [];
  let unparsed = 0;
  for (const d of input.deliveryPrices ?? []) {
    const match = d.name.match(/^(.+?),\s*(.+?)\s+-\s+(.+)$/);
    if (!match) {
      unparsed++;
      continue;
    }
    const price = toCents(d.express_price);
    districts.push({
      ubigeo: d.ubigeo,
      name: collapse(match[1]),
      province: collapse(match[2]),
      department: collapse(match[3]),
      deliveryPriceCents: isOn(d.is_express) && price > 0 ? price : null,
    });
  }
  if (unparsed) report.push(`${unparsed} distritos con nombre sin formato "Distrito, Provincia - Departamento".`);
  const withDelivery = districts.filter((d) => d.deliveryPriceCents !== null).length;
  if (districts.length) report.push(`${districts.length} distritos cargados; ${withDelivery} con delivery Lima (el resto, agencia o recojo).`);
  return { shippingMethods, districts };
}

/** "https://twentymoda.com/catalogo?category=jacket" → "/catalogo?categoria=jacket". */
export function normalizeInternalLink(link: string | null | undefined): string | null {
  if (!link) return null;
  const trimmed = link.trim().replace(/^https?:\/\/(www\.)?twentymoda\.com/i, "") || "/";
  return trimmed.replace("?category=", "?categoria=");
}

function buildSettings(input: LegacyInput, report: string[]) {
  const general = new Map(input.generals.map((g) => [g.correlative, g.status === "0" ? "" : (g.description ?? "").trim()]));
  const parse = <T>(key: string, fallback: T): T => {
    try {
      return JSON.parse(general.get(key) || "") as T;
    } catch {
      return fallback;
    }
  };

  const announcements = parse<{ text: string; enabled: boolean }[]>("cintillo", [])
    .filter((a) => a.enabled && a.text?.trim())
    .map((a) => collapse(a.text));

  const advisors = parse<{ phone?: string; message?: string }[]>("whatsapp_advisors", []);
  const whatsapp = advisors[0]?.phone ?? general.get("phone_whatsapp") ?? "";
  if (general.get("phone_whatsapp") && whatsapp.replace(/\D/g, "") !== general.get("phone_whatsapp")!.replace(/\D/g, "")) {
    report.push(
      `Hay dos números de WhatsApp: asesor ${whatsapp} y phone_whatsapp ${general.get("phone_whatsapp")}. Se usó el del asesor; confirmar con TWENTY.`,
    );
  }

  if (/48\s*HORAS/i.test(announcements.join(" ")) && /1 a 5 d[ií]as h[aá]biles/i.test(general.get("delivery_policy") ?? "")) {
    report.push(
      'El cintillo promete entrega en 48 horas en Lima, pero la política de envíos dice "1 a 5 días hábiles" y S/ 15 fijo. Confirmar con TWENTY.',
    );
  }

  const socials = input.socials
    .filter((s) => isOn(s.visible) && isOn(s.status))
    .sort((a, b) => toInt(a.order_index) - toInt(b.order_index))
    .map((s) => ({ name: collapse(s.description ?? ""), url: s.link.trim() }));

  const store = input.stores[0];
  const storeHours = store?.business_hours
    ? (JSON.parse(store.business_hours) as { day: string; open: string; close: string; closed: boolean }[])
    : [];

  return [
    { key: "announcements", value: announcements },
    {
      key: "contact",
      value: {
        whatsapp: whatsapp.replace(/[^\d+]/g, ""),
        whatsappMessage: advisors[0]?.message?.replace(/^!/, "¡") ?? general.get("message_whatsapp") ?? "",
        phone: general.get("phone_contact") ?? "",
        email: general.get("email_contact") ?? "",
        address: general.get("address") ?? "",
        openingHours: general.get("opening_hours") ?? "",
      },
    },
    { key: "socials", value: socials },
    {
      key: "store",
      value: store
        ? {
            name: collapse(store.name),
            address: collapse(store.address ?? "").replace(/\s+,/g, ","),
            phone: (store.phone ?? "").trim(),
            ubigeo: store.ubigeo,
            latitude: Number(store.latitude),
            longitude: Number(store.longitude),
            hours: storeHours.map((h) => ({ day: h.day, open: h.open, close: h.close, closed: h.closed })),
          }
        : null,
    },
    {
      key: "seo",
      value: {
        title: general.get("site_title") || "TWENTY",
        description: general.get("site_description") ?? "",
      },
    },
    {
      key: "payments",
      value: {
        walletEnabled: general.get("checkout_dwallet") === "true",
        walletName: general.get("checkout_dwallet_name") ?? "",
        walletDescription: general.get("checkout_dwallet_description") ?? "",
        // Imagen copiada de assets/public/qr-digital-wallet.jpeg a /public/pagos.
        walletQr: "/pagos/qr-yape-plin.jpeg",
      },
    },
    // Resumen para la ficha de producto, tomado de types_delivery y de la política de cambios.
    // Es contenido editable: el texto legal completo sigue en sus propias páginas.
    {
      key: "productInfo",
      value: {
        shipping: [
          "Lima Metropolitana: delivery en 24 a 48 horas.",
          "Provincias: envío por Shalom u Olva, de 1 a 5 días hábiles. El flete se paga en destino.",
          store ? `Recojo gratis en nuestra tienda: ${collapse(store.address ?? "")}.` : null,
          "El costo del envío se calcula en el checkout según tu distrito.",
        ].filter(Boolean),
        returns: [
          "Revisa bien la talla y el color antes de comprar: no hacemos cambios ni devoluciones por gusto.",
          "Si la prenda llega con un defecto de fábrica, te la cambiamos dentro de los 5 días desde el envío (sujeto a stock).",
        ],
      },
    },
  ];
}
