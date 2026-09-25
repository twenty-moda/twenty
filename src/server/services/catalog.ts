import { and, asc, eq, gt, inArray, isNull, lte, ne, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { pieceLabel } from "@/lib/outfits";
import { compareSizes } from "@/lib/sizes";
import type { Db } from "../db/client";
import {
  categories,
  colors,
  fits,
  outfitPieces,
  productImages,
  productRedirects,
  products,
  productVariants,
  promotionProducts,
  promotions,
  sizes,
} from "../db/schema";

export type ImageRef = { path: string; alt: string };
export type PromotionBadge = { id: string; name: string; quantity: number; bundlePriceCents: number };
export type Taxon = { slug: string; name: string };

export type ProductCard = {
  id: string;
  slug: string;
  name: string;
  category: Taxon;
  fit: Taxon | null;
  priceCents: number;
  compareAtPriceCents: number | null;
  hasPriceRange: boolean;
  image: ImageRef | null;
  hoverImage: ImageRef | null;
  colors: { slug: string; name: string; hex: string | null; inStock: boolean }[];
  /** Tallas con stock. */
  sizes: string[];
  inStock: boolean;
  isFeatured: boolean;
  promotion: PromotionBadge | null;
  position: number;
  /** Solo conjuntos: sus prendas (para "Cómpralo en conjunto" en la ficha de cada una). */
  outfit: { pieceProductIds: string[] } | null;
};

type VariantOptions = {
  colors: { id: string; slug: string; name: string; hex: string | null; images: ImageRef[] }[];
  sizes: { id: string; label: string }[];
  variants: {
    id: string;
    sku: string;
    colorId: string;
    sizeId: string;
    priceCents: number;
    compareAtPriceCents: number | null;
    stock: number;
  }[];
};

export type ProductDetail = VariantOptions & {
  kind: "single";
  id: string;
  slug: string;
  name: string;
  description: string | null;
  sizeGuide: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  category: Taxon;
  fit: Taxon | null;
  promotion: PromotionBadge | null;
};

/** Una pieza del conjunto: una prenda del catálogo con sus colores, tallas y stock. */
export type OutfitPieceDetail = VariantOptions & {
  label: string;
  productId: string;
  slug: string;
  name: string;
  sizeGuide: string | null;
  /** Si la prenda también se vende sola (tiene su ficha publicada). */
  soldSeparately: boolean;
};

export type OutfitDetail = {
  kind: "outfit";
  id: string;
  slug: string;
  name: string;
  description: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  category: Taxon;
  fit: Taxon | null;
  /** Fotos del conjunto (si no tiene, las de la primera pieza). */
  images: ImageRef[];
  priceCents: number;
  /** Lo que cuestan las piezas por separado (la más barata de cada una), si es más que el conjunto. */
  compareAtPriceCents: number | null;
  pieces: OutfitPieceDetail[];
};

export type StoreProduct = ProductDetail | OutfitDetail;

export type CategoryLink = Taxon & { image: string | null; productCount: number };

const sellable = and(eq(products.status, "active"), eq(categories.isVisible, true));

/** Promociones vigentes por producto (la de mayor prioridad gana). */
export async function activePromotionsByProduct(db: Db, productIds: string[], now: Date) {
  if (productIds.length === 0) return new Map<string, PromotionBadge>();
  const rows = await db
    .select({
      productId: promotionProducts.productId,
      id: promotions.id,
      name: promotions.name,
      quantity: promotions.quantity,
      bundlePriceCents: promotions.bundlePriceCents,
    })
    .from(promotionProducts)
    .innerJoin(promotions, eq(promotions.id, promotionProducts.promotionId))
    .where(
      and(
        inArray(promotionProducts.productId, productIds),
        eq(promotions.isActive, true),
        or(isNull(promotions.startsAt), lte(promotions.startsAt, now)),
        or(isNull(promotions.endsAt), gt(promotions.endsAt, now)),
      ),
    )
    .orderBy(asc(promotions.priority));
  const map = new Map<string, PromotionBadge>();
  for (const { productId, ...promo } of rows) if (!map.has(productId)) map.set(productId, promo);
  return map;
}

/** Todas las fichas publicadas, en el orden del catálogo. Es la base del home, el catálogo y la búsqueda. */
export async function listProductCards(db: Db, now = new Date()): Promise<ProductCard[]> {
  const base = await db
    .select({
      id: products.id,
      slug: products.slug,
      name: products.name,
      kind: products.kind,
      outfitPriceCents: products.outfitPriceCents,
      isFeatured: products.isFeatured,
      position: products.position,
      categorySlug: categories.slug,
      categoryName: categories.name,
      categoryPosition: categories.position,
      fitSlug: fits.slug,
      fitName: fits.name,
    })
    .from(products)
    .innerJoin(categories, eq(categories.id, products.categoryId))
    .leftJoin(fits, eq(fits.id, products.fitId))
    .where(sellable);
  if (base.length === 0) return [];
  const ids = base.map((p) => p.id);
  const outfitIds = base.filter((p) => p.kind === "outfit").map((p) => p.id);

  // Las piezas de los conjuntos pueden ser prendas en borrador (se venden solo en el conjunto): se leen aparte.
  const pieces = outfitIds.length
    ? await db
        .select({ outfitId: outfitPieces.outfitId, productId: outfitPieces.productId })
        .from(outfitPieces)
        .innerJoin(products, eq(products.id, outfitPieces.productId))
        .where(and(inArray(outfitPieces.outfitId, outfitIds), ne(products.status, "archived")))
        .orderBy(asc(outfitPieces.position))
    : [];
  const variantProductIds = [...new Set([...ids, ...pieces.map((p) => p.productId)])];

  const [variantRows, imageRows, colorRows, sizeRows, promos] = await Promise.all([
    db
      .select({
        productId: productVariants.productId,
        colorId: productVariants.colorId,
        sizeId: productVariants.sizeId,
        priceCents: productVariants.priceCents,
        compareAtPriceCents: productVariants.compareAtPriceCents,
        stock: productVariants.stock,
      })
      .from(productVariants)
      .where(and(inArray(productVariants.productId, variantProductIds), eq(productVariants.isActive, true)))
      .orderBy(asc(productVariants.position)),
    db
      .select({ productId: productImages.productId, colorId: productImages.colorId, path: productImages.path, alt: productImages.alt })
      .from(productImages)
      .where(inArray(productImages.productId, variantProductIds))
      .orderBy(asc(productImages.position)),
    db.select().from(colors),
    db.select().from(sizes),
    activePromotionsByProduct(db, ids, now),
  ]);

  const colorById = new Map(colorRows.map((c) => [c.id, c]));
  const sizeById = new Map(sizeRows.map((s) => [s.id, s]));
  const group = <T extends { productId: string }>(rows: T[]) => {
    const map = new Map<string, T[]>();
    for (const r of rows) map.set(r.productId, [...(map.get(r.productId) ?? []), r]);
    return map;
  };
  const variantsByProduct = group(variantRows);
  const imagesByProduct = group(imageRows);

  /** Colores (en orden, con o sin stock) y tallas con stock de un grupo de variantes. */
  const options = (variants: typeof variantRows) => {
    const colorOrder: string[] = [];
    const colorStock = new Map<string, boolean>();
    for (const v of variants) {
      if (!colorStock.has(v.colorId)) colorOrder.push(v.colorId);
      colorStock.set(v.colorId, (colorStock.get(v.colorId) ?? false) || v.stock > 0);
    }
    const sizesInStock = [...new Set(variants.filter((v) => v.stock > 0).map((v) => sizeById.get(v.sizeId)!.label))].sort(compareSizes);
    return {
      colorOrder,
      colorStock,
      sizesInStock,
      colors: colorOrder.map((id) => {
        const c = colorById.get(id)!;
        return { slug: c.slug, name: c.name, hex: c.hex, inStock: colorStock.get(id) ?? false };
      }),
    };
  };

  const cards: ProductCard[] = [];
  for (const p of base) {
    const images = imagesByProduct.get(p.id) ?? [];
    const toRef = (img: (typeof images)[number] | undefined): ImageRef | null => (img ? { path: img.path, alt: img.alt ?? p.name } : null);
    const common = {
      id: p.id,
      slug: p.slug,
      name: p.name,
      category: { slug: p.categorySlug, name: p.categoryName },
      fit: p.fitSlug && p.fitName ? { slug: p.fitSlug, name: p.fitName } : null,
      isFeatured: p.isFeatured,
      position: p.categoryPosition * 1000 + p.position,
    };

    if (p.kind === "outfit") {
      const pieceIds = pieces.filter((x) => x.outfitId === p.id).map((x) => x.productId);
      if (!p.outfitPriceCents || pieceIds.length < 2) continue;
      const pieceVariants = pieceIds.map((id) => variantsByProduct.get(id) ?? []);
      // Filtros del catálogo: los colores y tallas de todas sus piezas. Con stock si cada pieza tiene alguna talla.
      const { colors: outfitColors, sizesInStock } = options(pieceVariants.flat());
      const separately = pieceVariants.reduce((sum, vs) => sum + (vs.length ? Math.min(...vs.map((v) => v.priceCents)) : 0), 0);
      const pool = images.length ? images : (imagesByProduct.get(pieceIds[0]) ?? []);
      cards.push({
        ...common,
        priceCents: p.outfitPriceCents,
        compareAtPriceCents: separately > p.outfitPriceCents ? separately : null,
        hasPriceRange: false,
        image: toRef(pool[0]),
        hoverImage: toRef(pool[1]),
        colors: outfitColors,
        sizes: sizesInStock,
        inStock: pieceVariants.every((vs) => vs.some((v) => v.stock > 0)),
        promotion: null,
        outfit: { pieceProductIds: pieceIds },
      });
      continue;
    }

    const variants = variantsByProduct.get(p.id) ?? [];
    if (variants.length === 0) continue;

    const minPrice = Math.min(...variants.map((v) => v.priceCents));
    const maxPrice = Math.max(...variants.map((v) => v.priceCents));
    const cheapest = variants.filter((v) => v.priceCents === minPrice);
    const compareAt = Math.max(0, ...cheapest.map((v) => v.compareAtPriceCents ?? 0)) || null;
    const { colorOrder, colorStock, sizesInStock, colors: cardColors } = options(variants);

    // Foto principal: la del primer color con stock (o la primera que haya).
    const leadColor = colorOrder.find((id) => colorStock.get(id)) ?? colorOrder[0];
    const leadImages = images.filter((i) => i.colorId === leadColor);
    const pool = leadImages.length ? leadImages : images;

    cards.push({
      ...common,
      priceCents: minPrice,
      compareAtPriceCents: compareAt && compareAt > minPrice ? compareAt : null,
      hasPriceRange: minPrice !== maxPrice,
      image: toRef(pool[0]),
      hoverImage: toRef(pool[1]),
      colors: cardColors,
      sizes: sizesInStock,
      inStock: sizesInStock.length > 0,
      promotion: promos.get(p.id) ?? null,
      outfit: null,
    });
  }
  // Orden por defecto: con stock primero, luego destacados, luego el orden de categorías del menú.
  return cards.sort(
    (a, b) => Number(b.inStock) - Number(a.inStock) || Number(b.isFeatured) - Number(a.isFeatured) || a.position - b.position,
  );
}

/** Colores (con sus fotos), tallas y variantes activas de una prenda. */
async function loadVariantOptions(db: Db, productId: string, productName: string): Promise<VariantOptions> {
  const [variantRows, imageRows] = await Promise.all([
    db
      .select({
        id: productVariants.id,
        sku: productVariants.sku,
        colorId: productVariants.colorId,
        sizeId: productVariants.sizeId,
        priceCents: productVariants.priceCents,
        compareAtPriceCents: productVariants.compareAtPriceCents,
        stock: productVariants.stock,
        colorSlug: colors.slug,
        colorName: colors.name,
        colorHex: colors.hex,
        sizeLabel: sizes.label,
      })
      .from(productVariants)
      .innerJoin(colors, eq(colors.id, productVariants.colorId))
      .innerJoin(sizes, eq(sizes.id, productVariants.sizeId))
      .where(and(eq(productVariants.productId, productId), eq(productVariants.isActive, true)))
      .orderBy(asc(productVariants.position)),
    db
      .select({ colorId: productImages.colorId, path: productImages.path, alt: productImages.alt })
      .from(productImages)
      .where(eq(productImages.productId, productId))
      .orderBy(asc(productImages.position)),
  ]);

  const shared = imageRows.filter((i) => i.colorId === null);
  const colorList: VariantOptions["colors"] = [];
  for (const v of variantRows) {
    if (colorList.some((c) => c.id === v.colorId)) continue;
    const own = imageRows.filter((i) => i.colorId === v.colorId);
    colorList.push({
      id: v.colorId,
      slug: v.colorSlug,
      name: v.colorName,
      hex: v.colorHex,
      images: (own.length ? own : shared).map((i) => ({ path: i.path, alt: i.alt ?? productName })),
    });
  }
  // Un color sin fotos propias ni compartidas muestra las del primer color que sí tenga.
  const fallback = colorList.find((c) => c.images.length)?.images ?? [];
  for (const c of colorList) if (!c.images.length) c.images = fallback;

  const sizeList = [...new Map(variantRows.map((v) => [v.sizeId, { id: v.sizeId, label: v.sizeLabel }])).values()].sort((a, b) =>
    compareSizes(a.label, b.label),
  );
  return {
    colors: colorList,
    sizes: sizeList,
    variants: variantRows.map((v) => ({
      id: v.id,
      sku: v.sku,
      colorId: v.colorId,
      sizeId: v.sizeId,
      priceCents: v.priceCents,
      compareAtPriceCents: v.compareAtPriceCents,
      stock: v.stock,
    })),
  };
}

export async function getProductDetail(db: Db, slug: string, now = new Date()): Promise<StoreProduct | null> {
  const [p] = await db
    .select({
      id: products.id,
      slug: products.slug,
      name: products.name,
      kind: products.kind,
      outfitPriceCents: products.outfitPriceCents,
      description: products.description,
      sizeGuide: products.sizeGuide,
      metaTitle: products.metaTitle,
      metaDescription: products.metaDescription,
      categorySlug: categories.slug,
      categoryName: categories.name,
      fitSlug: fits.slug,
      fitName: fits.name,
    })
    .from(products)
    .innerJoin(categories, eq(categories.id, products.categoryId))
    .leftJoin(fits, eq(fits.id, products.fitId))
    .where(and(eq(products.slug, slug), sellable))
    .limit(1);
  if (!p) return null;
  const common = {
    id: p.id,
    slug: p.slug,
    name: p.name,
    description: p.description,
    metaTitle: p.metaTitle,
    metaDescription: p.metaDescription,
    category: { slug: p.categorySlug, name: p.categoryName },
    fit: p.fitSlug && p.fitName ? { slug: p.fitSlug, name: p.fitName } : null,
  };
  if (p.kind === "outfit") return getOutfitDetail(db, common, p.outfitPriceCents);

  const [options, promos] = await Promise.all([loadVariantOptions(db, p.id, p.name), activePromotionsByProduct(db, [p.id], now)]);
  if (options.variants.length === 0) return null;
  return { kind: "single", ...common, sizeGuide: p.sizeGuide, ...options, promotion: promos.get(p.id) ?? null };
}

async function getOutfitDetail(
  db: Db,
  common: Omit<OutfitDetail, "kind" | "images" | "priceCents" | "compareAtPriceCents" | "pieces">,
  priceCents: number | null,
): Promise<OutfitDetail | null> {
  if (!priceCents) return null;
  const pieceCategory = alias(categories, "piece_category");
  const [pieceRows, imageRows] = await Promise.all([
    db
      .select({
        label: outfitPieces.label,
        productId: products.id,
        slug: products.slug,
        name: products.name,
        sizeGuide: products.sizeGuide,
        status: products.status,
        categoryName: pieceCategory.name,
        categoryVisible: pieceCategory.isVisible,
      })
      .from(outfitPieces)
      .innerJoin(products, eq(products.id, outfitPieces.productId))
      .innerJoin(pieceCategory, eq(pieceCategory.id, products.categoryId))
      .where(eq(outfitPieces.outfitId, common.id))
      .orderBy(asc(outfitPieces.position)),
    db
      .select({ path: productImages.path, alt: productImages.alt })
      .from(productImages)
      .where(eq(productImages.productId, common.id))
      .orderBy(asc(productImages.position)),
  ]);
  if (pieceRows.length < 2 || pieceRows.some((r) => r.status === "archived")) return null;
  const pieces = await Promise.all(
    pieceRows.map(async (r) => ({
      label: pieceLabel(r.label, r.categoryName),
      productId: r.productId,
      slug: r.slug,
      name: r.name,
      sizeGuide: r.sizeGuide,
      soldSeparately: r.status === "active" && r.categoryVisible,
      ...(await loadVariantOptions(db, r.productId, r.name)),
    })),
  );
  if (pieces.some((piece) => piece.variants.length === 0)) return null;
  const separately = pieces.reduce((sum, piece) => sum + Math.min(...piece.variants.map((v) => v.priceCents)), 0);
  return {
    kind: "outfit",
    ...common,
    images: imageRows.length ? imageRows.map((i) => ({ path: i.path, alt: i.alt ?? common.name })) : pieces[0].colors[0]?.images ?? [],
    priceCents,
    compareAtPriceCents: separately > priceCents ? separately : null,
    pieces,
  };
}

export async function listProductSlugs(db: Db): Promise<string[]> {
  const rows = await db
    .select({ slug: products.slug })
    .from(products)
    .innerJoin(categories, eq(categories.id, products.categoryId))
    .where(sellable);
  return rows.map((r) => r.slug);
}

/** Categorías visibles con al menos un producto publicado, en el orden del menú. */
export async function listCategoryLinks(db: Db): Promise<CategoryLink[]> {
  const cards = await listProductCards(db);
  const counts = new Map<string, number>();
  for (const c of cards) counts.set(c.category.slug, (counts.get(c.category.slug) ?? 0) + 1);
  const rows = await db
    .select({ slug: categories.slug, name: categories.name, image: categories.image })
    .from(categories)
    .where(eq(categories.isVisible, true))
    .orderBy(asc(categories.position), asc(categories.name));
  return rows.filter((r) => counts.has(r.slug)).map((r) => ({ ...r, productCount: counts.get(r.slug)! }));
}

/**
 * URL anterior (variante o sitemap viejo) → URL nueva del producto, con la variante preseleccionada.
 * Devuelve null si el slug no corresponde a nada.
 */
export async function resolveLegacyProductUrl(db: Db, slug: string): Promise<string | null> {
  const [row] = await db
    .select({ productSlug: products.slug, colorSlug: colors.slug, sizeLabel: sizes.label })
    .from(productRedirects)
    .innerJoin(products, eq(products.id, productRedirects.productId))
    .leftJoin(productVariants, eq(productVariants.id, productRedirects.variantId))
    .leftJoin(colors, eq(colors.id, productVariants.colorId))
    .leftJoin(sizes, eq(sizes.id, productVariants.sizeId))
    .where(and(eq(productRedirects.fromSlug, slug), eq(products.status, "active")))
    .limit(1);
  if (!row) return null;
  const params = new URLSearchParams();
  if (row.colorSlug) params.set("color", row.colorSlug);
  if (row.sizeLabel) params.set("talla", row.sizeLabel);
  const query = params.toString();
  return `/product/${row.productSlug}${query ? `?${query}` : ""}`;
}

export type FeedVariant = {
  sku: string;
  productName: string;
  productSlug: string;
  description: string | null;
  category: string;
  color: string;
  colorSlug: string;
  size: string;
  priceCents: number;
  compareAtPriceCents: number | null;
  stock: number;
  image: string | null;
};

/** Una fila por variante activa (feed de productos para Google, Meta y asistentes de IA). */
export async function listFeedVariants(db: Db): Promise<FeedVariant[]> {
  const [rows, images] = await Promise.all([
    db
      .select({
        sku: productVariants.sku,
        productId: products.id,
        productName: products.name,
        productSlug: products.slug,
        description: products.description,
        category: categories.name,
        colorId: colors.id,
        color: colors.name,
        colorSlug: colors.slug,
        size: sizes.label,
        priceCents: productVariants.priceCents,
        compareAtPriceCents: productVariants.compareAtPriceCents,
        stock: productVariants.stock,
      })
      .from(productVariants)
      .innerJoin(products, eq(products.id, productVariants.productId))
      .innerJoin(categories, eq(categories.id, products.categoryId))
      .innerJoin(colors, eq(colors.id, productVariants.colorId))
      .innerJoin(sizes, eq(sizes.id, productVariants.sizeId))
      .where(and(sellable, eq(productVariants.isActive, true)))
      .orderBy(asc(productVariants.sku)),
    db.select().from(productImages).orderBy(asc(productImages.position)),
  ]);
  // Primera foto del color de la variante; si el color no tiene, la primera del producto.
  const byColor = new Map<string, string>();
  const byProduct = new Map<string, string>();
  for (const img of images) {
    if (img.colorId && !byColor.has(`${img.productId}:${img.colorId}`)) byColor.set(`${img.productId}:${img.colorId}`, img.path);
    if (!byProduct.has(img.productId)) byProduct.set(img.productId, img.path);
  }
  return rows.map(({ productId, colorId, ...r }) => ({ ...r, image: byColor.get(`${productId}:${colorId}`) ?? byProduct.get(productId) ?? null }));
}
