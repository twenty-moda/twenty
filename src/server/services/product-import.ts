/**
 * Carga masiva: compara las filas de la planilla con la BD, arma una vista previa y la aplica.
 * Regla: el SKU manda. Si el SKU existe se actualizan precio, stock y visibilidad; si no, se crea la
 * variante (y el producto si su nombre no existe). Las categorías deben existir; fits, colores y tallas
 * nuevos se crean solos.
 */
import { and, eq, sql } from "drizzle-orm";
import { formatPrice } from "@/lib/money";
import type { ImportIssue, ImportRow, ParsedSheet } from "@/lib/product-import";
import { slugify } from "@/lib/slug";
import type { Db } from "../db/client";
import { categories, colors, fits, productImages, products, productVariants, sizes } from "../db/schema";
import { addProductImage, ensureColor, ensureSize, nextSku } from "./admin-products";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Conn = Db | Tx;

export type ImportAction = "crear-producto" | "crear-variante" | "actualizar" | "sin-cambios";
export type ImportPlanRow = { row: number; action: ImportAction; product: string; variant: string; changes: string[] };
export type ImportPlan = {
  format: ParsedSheet["format"];
  rows: ImportPlanRow[];
  issues: ImportIssue[];
  summary: { newProducts: number; newVariants: number; updated: number; unchanged: number; skipped: number };
  newColors: string[];
  newSizes: string[];
  newFits: string[];
};

type Existing = Awaited<ReturnType<typeof loadExisting>>;

async function loadExisting(db: Conn) {
  const [categoryRows, fitRows, colorRows, sizeRows, productRows, variantRows] = await Promise.all([
    db.select({ id: categories.id, name: categories.name, slug: categories.slug }).from(categories),
    db.select({ id: fits.id, name: fits.name, slug: fits.slug }).from(fits),
    db.select({ id: colors.id, slug: colors.slug }).from(colors),
    db.select({ id: sizes.id, label: sizes.label }).from(sizes),
    db.select({ id: products.id, slug: products.slug, name: products.name, kind: products.kind }).from(products),
    db
      .select({
        id: productVariants.id,
        sku: productVariants.sku,
        productId: productVariants.productId,
        colorId: productVariants.colorId,
        sizeId: productVariants.sizeId,
        priceCents: productVariants.priceCents,
        compareAtPriceCents: productVariants.compareAtPriceCents,
        stock: productVariants.stock,
        isActive: productVariants.isActive,
      })
      .from(productVariants),
  ]);
  const category = new Map<string, (typeof categoryRows)[number]>();
  for (const c of categoryRows) {
    category.set(c.slug, c);
    category.set(slugify(c.name), c);
  }
  const fit = new Map<string, string>();
  for (const f of fitRows) {
    fit.set(f.slug, f.id);
    fit.set(slugify(f.name), f.id);
  }
  const product = new Map(productRows.map((p) => [p.slug, p]));
  const color = new Map(colorRows.map((c) => [c.slug, c.id]));
  const size = new Map(sizeRows.map((s) => [s.label, s.id]));
  const bySku = new Map(variantRows.map((v) => [v.sku, v]));
  const byOption = new Map(variantRows.map((v) => [`${v.productId}|${v.colorId}|${v.sizeId}`, v]));
  return { categoryNames: categoryRows.map((c) => c.name), category, fit, product, color, size, bySku, byOption };
}

type Resolved = { row: ImportRow; plan: ImportPlanRow; variantId: string | null; categoryId: string; productSlug: string };

function resolve(parsed: ParsedSheet, existing: Existing) {
  const issues: ImportIssue[] = [...parsed.issues];
  const resolved: Resolved[] = [];
  const newProducts = new Set<string>();
  const newColors = new Map<string, string>();
  const newSizes = new Set<string>();
  const newFits = new Map<string, string>();

  for (const row of parsed.rows) {
    const category = existing.category.get(slugify(row.category));
    if (!category) {
      issues.push({ row: row.row, message: `La categoría "${row.category}" no existe. Usa una de estas: ${existing.categoryNames.join(", ")}.` });
      continue;
    }
    const productSlug = slugify(row.product);
    const product = existing.product.get(productSlug);
    if (product?.kind === "outfit") {
      issues.push({ row: row.row, message: `“${row.product}” es un conjunto: sus prendas se cargan como productos aparte y el conjunto se arma en el panel.` });
      continue;
    }
    const colorId = existing.color.get(slugify(row.color));
    const sizeId = existing.size.get(row.size);
    const variant =
      (row.sku && existing.bySku.get(row.sku)) ||
      (!row.sku && product && colorId && sizeId ? existing.byOption.get(`${product.id}|${colorId}|${sizeId}`) : undefined);
    const variantLabel = `${row.color} · Talla ${row.size}${row.sku ? ` · ${row.sku}` : ""}`;

    if (variant) {
      const changes: string[] = [];
      if (variant.priceCents !== row.priceCents) changes.push(`Precio ${formatPrice(variant.priceCents)} → ${formatPrice(row.priceCents)}`);
      if ((variant.compareAtPriceCents ?? null) !== row.compareAtCents) {
        changes.push(row.compareAtCents ? `Precio antes ${formatPrice(row.compareAtCents)}` : "Sin precio antes");
      }
      if (variant.stock !== row.stock) changes.push(`Stock ${variant.stock} → ${row.stock}`);
      if (variant.isActive !== row.visible) changes.push(row.visible ? "Se muestra" : "Se oculta");
      resolved.push({
        row,
        variantId: variant.id,
        categoryId: category.id,
        productSlug,
        plan: { row: row.row, action: changes.length ? "actualizar" : "sin-cambios", product: row.product, variant: variantLabel, changes },
      });
      continue;
    }

    if (product && colorId && sizeId && existing.byOption.has(`${product.id}|${colorId}|${sizeId}`)) {
      const other = existing.byOption.get(`${product.id}|${colorId}|${sizeId}`)!;
      issues.push({ row: row.row, message: `${row.product} ${row.color} talla ${row.size} ya existe con el SKU ${other.sku}.` });
      continue;
    }

    if (!colorId) newColors.set(slugify(row.color), row.color);
    if (!sizeId) newSizes.add(row.size);
    if (row.fit && !existing.fit.has(slugify(row.fit))) newFits.set(slugify(row.fit), row.fit);
    const createsProduct = !product && !newProducts.has(productSlug);
    if (!product) newProducts.add(productSlug);
    resolved.push({
      row,
      variantId: null,
      categoryId: category.id,
      productSlug,
      plan: {
        row: row.row,
        action: createsProduct ? "crear-producto" : "crear-variante",
        product: row.product,
        variant: variantLabel,
        changes: [`${formatPrice(row.priceCents)} · Stock ${row.stock}`],
      },
    });
  }

  const count = (a: ImportAction) => resolved.filter((r) => r.plan.action === a).length;
  const plan: ImportPlan = {
    format: parsed.format,
    rows: resolved.map((r) => r.plan),
    issues: issues.sort((a, b) => a.row - b.row),
    summary: {
      newProducts: count("crear-producto"),
      newVariants: count("crear-producto") + count("crear-variante"),
      updated: count("actualizar"),
      unchanged: count("sin-cambios"),
      skipped: parsed.issues.length + (issues.length - parsed.issues.length),
    },
    newColors: [...newColors.values()],
    newSizes: [...newSizes],
    newFits: [...newFits.values()],
  };
  return { plan, resolved };
}

export async function planImport(db: Db, parsed: ParsedSheet): Promise<ImportPlan> {
  return resolve(parsed, await loadExisting(db)).plan;
}

/** Aplica la carga (las filas con errores se omiten). Devuelve los slugs afectados para refrescar la tienda. */
export async function applyImport(db: Db, parsed: ParsedSheet): Promise<{ plan: ImportPlan; productSlugs: string[] }> {
  return db.transaction(async (tx) => {
    const existing = await loadExisting(tx);
    const { plan, resolved } = resolve(parsed, existing);
    const productIds = new Map([...existing.product.entries()].map(([slug, p]) => [slug, p.id]));
    const fitIds = new Map(existing.fit);
    const taken = new Set(existing.bySku.keys());
    const touched = new Set<string>();

    for (const r of resolved) {
      const { row } = r;
      touched.add(r.productSlug);
      if (r.variantId) {
        if (r.plan.action === "sin-cambios") continue;
        await tx
          .update(productVariants)
          .set({ priceCents: row.priceCents, compareAtPriceCents: row.compareAtCents, stock: row.stock, isActive: row.visible })
          .where(eq(productVariants.id, r.variantId));
        continue;
      }

      let fitId: string | null = null;
      if (row.fit) {
        fitId = fitIds.get(slugify(row.fit)) ?? null;
        if (!fitId) {
          [{ id: fitId }] = await tx.insert(fits).values({ name: row.fit, slug: slugify(row.fit) }).returning({ id: fits.id });
          fitIds.set(slugify(row.fit), fitId);
        }
      }
      let productId = productIds.get(r.productSlug);
      if (!productId) {
        [{ id: productId }] = await tx
          .insert(products)
          .values({
            name: row.product,
            slug: r.productSlug,
            categoryId: r.categoryId,
            fitId,
            description: row.description,
            status: row.visible ? "active" : "draft",
          })
          .returning({ id: products.id });
        productIds.set(r.productSlug, productId);
      }
      const colorId = await ensureColor(tx, row.color);
      const sizeId = await ensureSize(tx, row.size);
      let sku = row.sku;
      if (!sku) {
        sku = await nextSku(tx, taken);
      }
      taken.add(sku);
      const [{ position }] = await tx
        .select({ position: sql<number>`coalesce(max(${productVariants.position}), -1)::int + 1` })
        .from(productVariants)
        .where(eq(productVariants.productId, productId));
      await tx.insert(productVariants).values({
        productId,
        sku,
        colorId,
        sizeId,
        priceCents: row.priceCents,
        compareAtPriceCents: row.compareAtCents,
        stock: row.stock,
        isActive: row.visible,
        position,
      });
    }
    return { plan, productSlugs: [...touched] };
  });
}

// ─── Fotos por SKU ───────────────────────────────────────────────────────────

/** Catálogo actual en el formato de la plantilla nueva: se edita en Excel y se vuelve a subir. */
export async function exportCatalogRows(db: Db): Promise<(string | number)[][]> {
  const rows = await db
    .select({
      product: products.name,
      category: categories.name,
      fit: fits.name,
      color: colors.name,
      size: sizes.label,
      sku: productVariants.sku,
      price: productVariants.priceCents,
      compareAt: productVariants.compareAtPriceCents,
      stock: productVariants.stock,
      description: products.description,
      active: productVariants.isActive,
    })
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .innerJoin(categories, eq(categories.id, products.categoryId))
    .leftJoin(fits, eq(fits.id, products.fitId))
    .innerJoin(colors, eq(colors.id, productVariants.colorId))
    .innerJoin(sizes, eq(sizes.id, productVariants.sizeId))
    .orderBy(products.name, colors.name, sizes.position);
  return rows.map((r) => [
    r.product,
    r.category,
    r.fit ?? "",
    r.color,
    r.size,
    r.sku,
    r.price / 100,
    r.compareAt ? r.compareAt / 100 : "",
    r.stock,
    r.description ?? "",
    r.active ? "sí" : "no",
  ]);
}

export async function findVariantForPhoto(db: Db, sku: string) {
  const [row] = await db
    .select({ productId: products.id, productSlug: products.slug, productName: products.name, colorId: colors.id, colorName: colors.name })
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .innerJoin(colors, eq(colors.id, productVariants.colorId))
    .where(and(eq(productVariants.sku, sku)))
    .limit(1);
  return row ?? null;
}

/**
 * Asigna una foto subida con el nombre del SKU. Cada subida se guarda con un nombre nuevo
 * ("item/TMW-0001-a1b2c3d4.webp") para que el CDN nunca muestre la versión anterior; si el producto ya tenía
 * una foto de ese mismo SKU y posición (`base`, p. ej. "TMW-0001" o "TMW-0001_02"), esta la reemplaza.
 */
export async function attachPhoto(
  db: Db,
  target: { productId: string; colorId: string; productName: string; colorName: string },
  path: string,
  position: number,
  base: string,
) {
  const escaped = base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const previous = await db
    .delete(productImages)
    .where(and(eq(productImages.productId, target.productId), sql`${productImages.path} ~ ${`^item/${escaped}(-[0-9a-f]{8})?\\.webp$`}`))
    .returning({ position: productImages.position });
  await addProductImage(db, {
    productId: target.productId,
    colorId: target.colorId,
    path,
    alt: `${target.productName} - ${target.colorName}`,
    position: previous[0]?.position ?? position,
  });
}
