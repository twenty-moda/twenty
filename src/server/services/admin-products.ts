/** Catálogo desde el admin: productos, variantes, fotos, inventario, categorías y fits. */
import { and, asc, desc, eq, ilike, inArray, lte, ne, notInArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import { MAX_OUTFIT_PIECES, MIN_OUTFIT_PIECES, pieceLabel } from "@/lib/outfits";
import { compareSizes, sizeRank } from "@/lib/sizes";
import { slugify } from "@/lib/slug";
import type { Db } from "../db/client";
import {
  categories,
  colors,
  fits,
  orderItems,
  outfitPieces,
  productImages,
  productRedirects,
  products,
  productVariants,
  sizes,
} from "../db/schema";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Conn = Db | Tx;

export type ServiceResult<T = object> = ({ ok: true } & T) | { ok: false; message: string };

// ─── Listado y ficha ─────────────────────────────────────────────────────────

export type AdminProductFilter = { q?: string; category?: string; status?: "active" | "draft" | "archived"; problem?: "sin-fotos" | "sin-stock" };

export async function listAdminProducts(db: Db, filter: AdminProductFilter = {}) {
  const conditions = [];
  if (filter.q?.trim()) {
    const like = `%${filter.q.trim()}%`;
    conditions.push(
      or(
        ilike(products.name, like),
        ilike(products.slug, like),
        sql`exists (select 1 from ${productVariants} v where v.product_id = ${products.id} and v.sku ilike ${like})`,
      ),
    );
  }
  if (filter.category) conditions.push(eq(categories.slug, filter.category));
  if (filter.status) conditions.push(eq(products.status, filter.status));

  const rows = await db
    .select({
      id: products.id,
      slug: products.slug,
      name: products.name,
      status: products.status,
      isFeatured: products.isFeatured,
      kind: products.kind,
      outfitPriceCents: products.outfitPriceCents,
      pieces: sql<number>`(select count(*)::int from ${outfitPieces} op where op.outfit_id = ${products.id})`,
      categoryName: categories.name,
      updatedAt: products.updatedAt,
      variants: sql<number>`(select count(*)::int from ${productVariants} v where v.product_id = ${products.id})`,
      totalStock: sql<number>`(select coalesce(sum(v.stock), 0)::int from ${productVariants} v where v.product_id = ${products.id} and v.is_active)`,
      minPrice: sql<number | null>`(select min(v.price_cents) from ${productVariants} v where v.product_id = ${products.id} and v.is_active)`,
      maxPrice: sql<number | null>`(select max(v.price_cents) from ${productVariants} v where v.product_id = ${products.id} and v.is_active)`,
      image: sql<string | null>`(select i.path from ${productImages} i where i.product_id = ${products.id} order by i.color_id nulls last, i.position limit 1)`,
      images: sql<number>`(select count(*)::int from ${productImages} i where i.product_id = ${products.id})`,
    })
    .from(products)
    .innerJoin(categories, eq(categories.id, products.categoryId))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(products.updatedAt));

  if (filter.problem === "sin-fotos") return rows.filter((r) => r.images === 0);
  // Un conjunto no tiene stock propio (es el de sus prendas).
  if (filter.problem === "sin-stock") return rows.filter((r) => r.kind === "single" && r.totalStock === 0);
  return rows;
}

export async function getCatalogOptions(db: Db) {
  const [categoryRows, fitRows, colorRows, sizeRows] = await Promise.all([
    db.select({ id: categories.id, name: categories.name, slug: categories.slug }).from(categories).orderBy(asc(categories.position), asc(categories.name)),
    db.select({ id: fits.id, name: fits.name, slug: fits.slug }).from(fits).orderBy(asc(fits.name)),
    db.select({ id: colors.id, name: colors.name, slug: colors.slug, hex: colors.hex }).from(colors).orderBy(asc(colors.position), asc(colors.name)),
    db.select({ id: sizes.id, label: sizes.label }).from(sizes).orderBy(asc(sizes.position), asc(sizes.label)),
  ]);
  return { categories: categoryRows, fits: fitRows, colors: colorRows, sizes: sizeRows };
}

export async function getAdminProduct(db: Db, id: string) {
  const [product] = await db.select().from(products).where(eq(products.id, id)).limit(1);
  if (!product) return null;
  const [variantRows, imageRows] = await Promise.all([
    db
      .select({
        id: productVariants.id,
        sku: productVariants.sku,
        colorId: productVariants.colorId,
        colorName: colors.name,
        sizeId: productVariants.sizeId,
        sizeLabel: sizes.label,
        priceCents: productVariants.priceCents,
        compareAtPriceCents: productVariants.compareAtPriceCents,
        stock: productVariants.stock,
        isActive: productVariants.isActive,
        colorPosition: colors.position,
        sizePosition: sizes.position,
      })
      .from(productVariants)
      .innerJoin(colors, eq(colors.id, productVariants.colorId))
      .innerJoin(sizes, eq(sizes.id, productVariants.sizeId))
      .where(eq(productVariants.productId, id))
      .orderBy(asc(colors.position), asc(colors.name), asc(sizes.position)),
    db.select().from(productImages).where(eq(productImages.productId, id)).orderBy(asc(productImages.position)),
  ]);
  const pieces = product.kind === "outfit" ? await listOutfitPieces(db, id) : [];
  return { product, variants: variantRows, images: imageRows, pieces };
}

/** Piezas de un conjunto con lo que el panel necesita para avisar (stock, estado, precio). */
export async function listOutfitPieces(db: Db, outfitId: string) {
  return db
    .select({
      productId: outfitPieces.productId,
      label: outfitPieces.label,
      name: products.name,
      slug: products.slug,
      status: products.status,
      categoryName: categories.name,
      minPrice: sql<number | null>`(select min(v.price_cents) from ${productVariants} v where v.product_id = ${products.id} and v.is_active)`,
      totalStock: sql<number>`(select coalesce(sum(v.stock), 0)::int from ${productVariants} v where v.product_id = ${products.id} and v.is_active)`,
    })
    .from(outfitPieces)
    .innerJoin(products, eq(products.id, outfitPieces.productId))
    .innerJoin(categories, eq(categories.id, products.categoryId))
    .where(eq(outfitPieces.outfitId, outfitId))
    .orderBy(asc(outfitPieces.position));
}

/** Prendas que pueden ser pieza de un conjunto (las que no son conjuntos ni están archivadas). */
export async function listOutfitCandidates(db: Db) {
  return db
    .select({
      id: products.id,
      name: products.name,
      status: products.status,
      categoryName: categories.name,
      minPrice: sql<number | null>`(select min(v.price_cents) from ${productVariants} v where v.product_id = ${products.id} and v.is_active)`,
      totalStock: sql<number>`(select coalesce(sum(v.stock), 0)::int from ${productVariants} v where v.product_id = ${products.id} and v.is_active)`,
    })
    .from(products)
    .innerJoin(categories, eq(categories.id, products.categoryId))
    .where(and(eq(products.kind, "single"), ne(products.status, "archived")))
    .orderBy(asc(categories.position), asc(products.name));
}

export const outfitInputSchema = z.object({
  priceCents: z.number({ error: "Escribe el precio del conjunto" }).int().positive("Escribe el precio del conjunto"),
  pieces: z
    .array(z.object({ productId: z.uuid("Elige la prenda"), label: z.string().trim().max(40).nullable() }))
    .min(MIN_OUTFIT_PIECES, `Un conjunto lleva al menos ${MIN_OUTFIT_PIECES} prendas`)
    .max(MAX_OUTFIT_PIECES, `Un conjunto lleva como máximo ${MAX_OUTFIT_PIECES} prendas`),
});

/** Guarda el precio y las piezas de un conjunto. Devuelve los slugs a refrescar (el conjunto y sus prendas). */
export async function saveOutfit(db: Db, outfitId: string, input: z.infer<typeof outfitInputSchema>): Promise<ServiceResult<{ slugs: string[] }>> {
  const [outfit] = await db.select({ kind: products.kind, slug: products.slug }).from(products).where(eq(products.id, outfitId)).limit(1);
  if (!outfit || outfit.kind !== "outfit") return { ok: false, message: "El conjunto no existe." };
  const ids = [...new Set(input.pieces.map((p) => p.productId))];
  const rows = await db
    .select({ id: products.id, kind: products.kind, status: products.status, slug: products.slug, name: products.name, categoryName: categories.name })
    .from(products)
    .innerJoin(categories, eq(categories.id, products.categoryId))
    .where(inArray(products.id, ids));
  const byId = new Map(rows.map((r) => [r.id, r]));
  for (const piece of input.pieces) {
    const row = byId.get(piece.productId);
    if (!row) return { ok: false, message: "Una de las prendas ya no existe." };
    if (row.kind !== "single") return { ok: false, message: `“${row.name}” es un conjunto: elige prendas.` };
    if (row.status === "archived") return { ok: false, message: `“${row.name}” está archivada: publícala o elige otra.` };
  }

  await db.transaction(async (tx) => {
    await tx.update(products).set({ outfitPriceCents: input.priceCents }).where(eq(products.id, outfitId));
    await tx.delete(outfitPieces).where(eq(outfitPieces.outfitId, outfitId));
    await tx.insert(outfitPieces).values(
      input.pieces.map((piece, position) => {
        // Si el nombre es el de la categoría, no se guarda: así sigue a la categoría si se renombra.
        const label = piece.label && piece.label !== pieceLabel(null, byId.get(piece.productId)!.categoryName) ? piece.label : null;
        return { outfitId, position, productId: piece.productId, label };
      }),
    );
  });
  return { ok: true, slugs: [outfit.slug, ...rows.map((r) => r.slug)] };
}

/** Conjuntos que llevan una prenda (para no borrarla ni archivarla sin avisar). */
export async function outfitsUsing(db: Db, productId: string) {
  return db
    .select({ id: products.id, name: products.name })
    .from(outfitPieces)
    .innerJoin(products, eq(products.id, outfitPieces.outfitId))
    .where(eq(outfitPieces.productId, productId));
}

// ─── Guardar producto ────────────────────────────────────────────────────────

export const productInputSchema = z.object({
  name: z.string().trim().min(2, "Escribe el nombre").max(120),
  slug: z
    .string()
    .trim()
    .max(120)
    .transform((s) => slugify(s))
    .optional(),
  categoryId: z.uuid("Elige una categoría"),
  fitId: z.uuid().nullable().optional(),
  description: z.string().trim().max(3000).nullable().optional(),
  sizeGuide: z.string().trim().max(5000).nullable().optional(),
  status: z.enum(["active", "draft", "archived"]),
  isFeatured: z.boolean(),
  metaTitle: z.string().trim().max(70).nullable().optional(),
  metaDescription: z.string().trim().max(170).nullable().optional(),
  /** Solo al crear: prenda o conjunto. No se cambia después. */
  kind: z.enum(["single", "outfit"]).default("single"),
});
export type ProductInput = z.input<typeof productInputSchema>;

/** Crea o actualiza. Si cambia el slug, la URL vieja redirige a la nueva (no se pierde SEO). */
export async function saveProduct(
  db: Db,
  id: string | null,
  input: ProductInput,
): Promise<ServiceResult<{ id: string; slug: string; previousSlug: string | null }>> {
  const slug = input.slug || slugify(input.name);
  if (!slug) return { ok: false, message: "El nombre necesita letras o números." };
  const [clash] = await db
    .select({ id: products.id })
    .from(products)
    .where(and(eq(products.slug, slug), id ? ne(products.id, id) : undefined))
    .limit(1);
  if (clash) return { ok: false, message: `Ya hay otro producto con la dirección /product/${slug}. Cambia el nombre o el slug.` };

  const values = {
    name: input.name,
    slug,
    categoryId: input.categoryId,
    fitId: input.fitId ?? null,
    description: input.description || null,
    sizeGuide: input.sizeGuide || null,
    status: input.status,
    isFeatured: input.isFeatured,
    metaTitle: input.metaTitle || null,
    metaDescription: input.metaDescription || null,
  };

  return db.transaction(async (tx) => {
    if (!id) {
      const [created] = await tx
        .insert(products)
        .values({ ...values, kind: input.kind ?? "single" })
        .returning({ id: products.id });
      return { ok: true as const, id: created.id, slug, previousSlug: null };
    }
    const [current] = await tx.select({ slug: products.slug }).from(products).where(eq(products.id, id)).limit(1);
    if (!current) return { ok: false as const, message: "El producto no existe." };
    await tx.update(products).set(values).where(eq(products.id, id));
    if (current.slug !== slug) {
      await tx
        .insert(productRedirects)
        .values({ fromSlug: current.slug, productId: id })
        .onConflictDoUpdate({ target: productRedirects.fromSlug, set: { productId: id, variantId: null } });
      await tx.delete(productRedirects).where(eq(productRedirects.fromSlug, slug));
    }
    return { ok: true as const, id, slug, previousSlug: current.slug !== slug ? current.slug : null };
  });
}

export async function getProductSlug(db: Db, id: string): Promise<string | null> {
  const [row] = await db.select({ slug: products.slug }).from(products).where(eq(products.id, id)).limit(1);
  return row?.slug ?? null;
}

export async function getImageProduct(db: Db, imageId: string) {
  const [row] = await db
    .select({ productId: productImages.productId, slug: products.slug })
    .from(productImages)
    .innerJoin(products, eq(products.id, productImages.productId))
    .where(eq(productImages.id, imageId))
    .limit(1);
  return row ?? null;
}

export async function deleteProduct(db: Db, id: string): Promise<ServiceResult<{ slug: string }>> {
  const [product] = await db.select({ slug: products.slug }).from(products).where(eq(products.id, id)).limit(1);
  if (!product) return { ok: false, message: "El producto no existe." };
  const outfits = await outfitsUsing(db, id);
  if (outfits.length) {
    return { ok: false, message: `Es parte de ${outfits.length === 1 ? "el conjunto" : "los conjuntos"} ${outfits.map((o) => `“${o.name}”`).join(", ")}: quítala del conjunto antes de eliminarla.` };
  }
  const [sold] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(orderItems)
    .where(or(eq(orderItems.productId, id), eq(orderItems.outfitId, id)));
  if (sold.n > 0) {
    // Con ventas no se borra: se archiva para conservar la historia de los pedidos.
    await db.update(products).set({ status: "archived" }).where(eq(products.id, id));
    return { ok: true, slug: product.slug };
  }
  await db.delete(products).where(eq(products.id, id));
  return { ok: true, slug: product.slug };
}

// ─── Colores y tallas ────────────────────────────────────────────────────────

/** Busca el color por nombre (sin tildes ni mayúsculas) o lo crea. */
export async function ensureColor(db: Conn, name: string): Promise<string> {
  const clean = name.replace(/\s+/g, " ").trim();
  const slug = slugify(clean);
  const [existing] = await db.select({ id: colors.id }).from(colors).where(eq(colors.slug, slug)).limit(1);
  if (existing) return existing.id;
  const [{ max }] = await db.select({ max: sql<number>`coalesce(max(${colors.position}), 0)::int` }).from(colors);
  const [created] = await db
    .insert(colors)
    .values({ slug, name: clean.replace(/(^|\s)(\p{L})/gu, (_, s: string, c: string) => s + c.toLocaleUpperCase("es")), position: max + 1 })
    .onConflictDoNothing()
    .returning({ id: colors.id });
  if (created) return created.id;
  const [again] = await db.select({ id: colors.id }).from(colors).where(eq(colors.slug, slug)).limit(1);
  return again.id;
}

export async function ensureSize(db: Conn, label: string): Promise<string> {
  const clean = label.trim().toUpperCase();
  const [existing] = await db.select({ id: sizes.id }).from(sizes).where(eq(sizes.label, clean)).limit(1);
  if (existing) return existing.id;
  const [created] = await db.insert(sizes).values({ label: clean, position: sizeRank(clean) }).onConflictDoNothing().returning({ id: sizes.id });
  if (created) return created.id;
  const [again] = await db.select({ id: sizes.id }).from(sizes).where(eq(sizes.label, clean)).limit(1);
  return again.id;
}

/** Siguiente SKU libre con el formato TMW-0001. */
export async function nextSku(db: Conn, taken: Set<string> = new Set()): Promise<string> {
  const [{ max }] = await db
    .select({ max: sql<number>`coalesce(max((substring(${productVariants.sku} from '^TMW-(\\d+)$'))::int), 0)::int` })
    .from(productVariants);
  let n = max + 1;
  let sku = `TMW-${String(n).padStart(4, "0")}`;
  while (taken.has(sku)) sku = `TMW-${String(++n).padStart(4, "0")}`;
  return sku;
}

// ─── Variantes ───────────────────────────────────────────────────────────────

export const variantInputSchema = z.object({
  id: z.uuid().optional(),
  color: z.string().trim().min(1, "Falta el color").max(60),
  size: z.string().trim().min(1, "Falta la talla").max(12),
  sku: z.string().trim().toUpperCase().max(40).optional().default(""),
  priceCents: z.number().int().positive("El precio debe ser mayor que 0"),
  compareAtPriceCents: z.number().int().positive().nullable(),
  stock: z.number().int().min(0, "El stock no puede ser negativo"),
  isActive: z.boolean(),
});
export type VariantInput = z.infer<typeof variantInputSchema>;

/**
 * Reemplaza las variantes del producto por la lista enviada: crea, actualiza y elimina las que ya no estén
 * (si una variante ya se vendió, se desactiva en vez de borrarse).
 */
export async function saveVariants(db: Db, productId: string, input: VariantInput[]): Promise<ServiceResult> {
  const optionKeys = new Set<string>();
  for (const v of input) {
    const k = `${slugify(v.color)}|${v.size.toUpperCase()}`;
    if (optionKeys.has(k)) return { ok: false, message: `Hay dos variantes ${v.color} talla ${v.size}.` };
    optionKeys.add(k);
  }
  const skus = input.map((v) => v.sku).filter(Boolean);
  if (new Set(skus).size !== skus.length) return { ok: false, message: "Hay SKUs repetidos en la lista." };

  return db.transaction(async (tx) => {
    const existing = await tx.select({ id: productVariants.id }).from(productVariants).where(eq(productVariants.productId, productId));
    const keepIds = input.map((v) => v.id).filter((id): id is string => !!id && existing.some((e) => e.id === id));

    if (skus.length) {
      const clash = await tx
        .select({ sku: productVariants.sku })
        .from(productVariants)
        .where(and(inArray(productVariants.sku, skus), keepIds.length ? notInArray(productVariants.id, keepIds) : undefined));
      const foreign = clash.filter((c) => !input.some((v) => v.id && v.sku === c.sku && keepIds.includes(v.id)));
      if (foreign.length) return { ok: false as const, message: `El SKU ${foreign[0].sku} ya lo usa otra prenda.` };
    }

    // Variantes quitadas: se borran; las que tienen ventas se desactivan.
    const removed = existing.map((e) => e.id).filter((id) => !keepIds.includes(id));
    if (removed.length) {
      const sold = await tx
        .selectDistinct({ variantId: orderItems.variantId })
        .from(orderItems)
        .where(inArray(orderItems.variantId, removed));
      const soldIds = sold.map((s) => s.variantId!).filter(Boolean);
      const deletable = removed.filter((id) => !soldIds.includes(id));
      if (deletable.length) await tx.delete(productVariants).where(inArray(productVariants.id, deletable));
      if (soldIds.length) await tx.update(productVariants).set({ isActive: false }).where(inArray(productVariants.id, soldIds));
    }

    const taken = new Set(skus);
    const sorted = [...input].sort((a, b) => a.color.localeCompare(b.color, "es") || compareSizes(a.size, b.size));
    for (const [position, v] of sorted.entries()) {
      const colorId = await ensureColor(tx, v.color);
      const sizeId = await ensureSize(tx, v.size);
      let sku = v.sku;
      if (!sku) {
        sku = await nextSku(tx, taken);
        taken.add(sku);
      }
      const values = {
        productId,
        sku,
        colorId,
        sizeId,
        priceCents: v.priceCents,
        compareAtPriceCents: v.compareAtPriceCents && v.compareAtPriceCents > v.priceCents ? v.compareAtPriceCents : null,
        stock: v.stock,
        isActive: v.isActive,
        position,
      };
      if (v.id && keepIds.includes(v.id)) await tx.update(productVariants).set(values).where(eq(productVariants.id, v.id));
      else await tx.insert(productVariants).values(values);
    }
    return { ok: true as const };
  });
}

// ─── Inventario (edición rápida de stock y precio) ──────────────────────────

export async function listInventory(db: Db, { q, low }: { q?: string; low?: boolean } = {}) {
  const conditions = [];
  if (q?.trim()) {
    const like = `%${q.trim()}%`;
    conditions.push(or(ilike(products.name, like), ilike(productVariants.sku, like), ilike(colors.name, like)));
  }
  if (low) conditions.push(lte(productVariants.stock, 2));
  return db
    .select({
      variantId: productVariants.id,
      sku: productVariants.sku,
      productId: products.id,
      productName: products.name,
      productStatus: products.status,
      colorName: colors.name,
      sizeLabel: sizes.label,
      stock: productVariants.stock,
      priceCents: productVariants.priceCents,
      compareAtPriceCents: productVariants.compareAtPriceCents,
      isActive: productVariants.isActive,
    })
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .innerJoin(colors, eq(colors.id, productVariants.colorId))
    .innerJoin(sizes, eq(sizes.id, productVariants.sizeId))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(asc(products.name), asc(colors.name), asc(sizes.position));
}

export const inventoryUpdateSchema = z.array(
  z.object({
    variantId: z.uuid(),
    stock: z.number().int().min(0),
    priceCents: z.number().int().positive(),
    compareAtPriceCents: z.number().int().positive().nullable(),
  }),
);

/** Guarda varios cambios de stock y precio a la vez. Devuelve los slugs afectados (para refrescar la tienda). */
export async function updateInventory(db: Db, updates: z.infer<typeof inventoryUpdateSchema>): Promise<string[]> {
  if (updates.length === 0) return [];
  return db.transaction(async (tx) => {
    for (const u of updates) {
      await tx
        .update(productVariants)
        .set({
          stock: u.stock,
          priceCents: u.priceCents,
          compareAtPriceCents: u.compareAtPriceCents && u.compareAtPriceCents > u.priceCents ? u.compareAtPriceCents : null,
        })
        .where(eq(productVariants.id, u.variantId));
    }
    const rows = await tx
      .selectDistinct({ slug: products.slug })
      .from(productVariants)
      .innerJoin(products, eq(products.id, productVariants.productId))
      .where(inArray(productVariants.id, updates.map((u) => u.variantId)));
    return rows.map((r) => r.slug);
  });
}

// ─── Fotos ───────────────────────────────────────────────────────────────────

export async function addProductImage(db: Conn, input: { productId: string; colorId: string | null; path: string; alt?: string | null; position?: number }) {
  const [dup] = await db
    .select({ id: productImages.id })
    .from(productImages)
    .where(and(eq(productImages.productId, input.productId), eq(productImages.path, input.path)))
    .limit(1);
  if (dup) {
    await db.update(productImages).set({ colorId: input.colorId }).where(eq(productImages.id, dup.id));
    return dup.id;
  }
  const [{ max }] = await db
    .select({ max: sql<number>`coalesce(max(${productImages.position}), -1)::int` })
    .from(productImages)
    .where(eq(productImages.productId, input.productId));
  const [row] = await db
    .insert(productImages)
    .values({ productId: input.productId, colorId: input.colorId, path: input.path, alt: input.alt ?? null, position: input.position ?? max + 1 })
    .returning({ id: productImages.id });
  return row.id;
}

export async function updateProductImage(db: Db, id: string, data: { colorId?: string | null; alt?: string | null }) {
  await db.update(productImages).set(data).where(eq(productImages.id, id));
}

export async function deleteProductImage(db: Db, id: string) {
  await db.delete(productImages).where(eq(productImages.id, id));
}

/** Mueve una foto una posición antes o después entre las fotos de su mismo color. */
export async function moveProductImage(db: Db, id: string, direction: -1 | 1) {
  const [image] = await db.select().from(productImages).where(eq(productImages.id, id)).limit(1);
  if (!image) return;
  const all = (
    await db.select().from(productImages).where(eq(productImages.productId, image.productId)).orderBy(asc(productImages.position), asc(productImages.createdAt))
  ).filter((i) => i.colorId === image.colorId);
  const index = all.findIndex((i) => i.id === id);
  const target = index + direction;
  if (target < 0 || target >= all.length) return;
  [all[index], all[target]] = [all[target], all[index]];
  await db.transaction(async (tx) => {
    for (const [position, img] of all.entries()) await tx.update(productImages).set({ position }).where(eq(productImages.id, img.id));
  });
}

// ─── Categorías y fits ───────────────────────────────────────────────────────

export async function listTaxonomy(db: Db) {
  const [categoryRows, fitRows] = await Promise.all([
    db
      .select({
        id: categories.id,
        name: categories.name,
        slug: categories.slug,
        image: categories.image,
        isVisible: categories.isVisible,
        position: categories.position,
        products: sql<number>`(select count(*)::int from ${products} p where p.category_id = ${categories.id})`,
      })
      .from(categories)
      .orderBy(asc(categories.position), asc(categories.name)),
    db
      .select({
        id: fits.id,
        name: fits.name,
        slug: fits.slug,
        isVisible: fits.isVisible,
        products: sql<number>`(select count(*)::int from ${products} p where p.fit_id = ${fits.id})`,
      })
      .from(fits)
      .orderBy(asc(fits.name)),
  ]);
  return { categories: categoryRows, fits: fitRows };
}

export const taxonInputSchema = z.object({
  name: z.string().trim().min(2, "Escribe el nombre").max(60),
  slug: z.string().trim().max(60).optional(),
  isVisible: z.boolean(),
  position: z.number().int().min(0).max(999).optional(),
});

export async function saveTaxon(db: Db, kind: "category" | "fit", id: string | null, input: z.infer<typeof taxonInputSchema>): Promise<ServiceResult<{ id: string }>> {
  const table = kind === "category" ? categories : fits;
  const slug = slugify(input.slug || input.name);
  const [clash] = await db
    .select({ id: table.id })
    .from(table)
    .where(and(eq(table.slug, slug), id ? ne(table.id, id) : undefined))
    .limit(1);
  if (clash) return { ok: false, message: `Ya existe "${input.name}".` };
  const values = { name: input.name, slug, isVisible: input.isVisible, ...(input.position !== undefined ? { position: input.position } : {}) };
  if (id) {
    await db.update(table).set(values).where(eq(table.id, id));
    return { ok: true, id };
  }
  const [row] = await db.insert(table).values(values).returning({ id: table.id });
  return { ok: true, id: row.id };
}

export async function setTaxonImage(db: Db, kind: "category" | "fit", id: string, image: string | null) {
  const table = kind === "category" ? categories : fits;
  await db.update(table).set({ image }).where(eq(table.id, id));
}

export async function deleteTaxon(db: Db, kind: "category" | "fit", id: string): Promise<ServiceResult> {
  const column = kind === "category" ? products.categoryId : products.fitId;
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(products).where(eq(column, id));
  if (n > 0) return { ok: false, message: `Tiene ${n} ${n === 1 ? "producto" : "productos"}. Muévelos a otra ${kind === "category" ? "categoría" : "fit"} antes de borrarla.` };
  await db.delete(kind === "category" ? categories : fits).where(eq((kind === "category" ? categories : fits).id, id));
  return { ok: true };
}
