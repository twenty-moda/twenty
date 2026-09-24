import { asc, eq, inArray } from "drizzle-orm";
import type { VariantSnapshot } from "@/lib/cart";
import type { Db } from "../db/client";
import { categories, colors, productImages, products, productVariants, sizes } from "../db/schema";
import { activePromotionsByProduct } from "./catalog";

/** Datos actuales (precio, stock, disponibilidad) de las variantes que el cliente tiene en su carrito. */
export async function getVariantSnapshots(db: Db, variantIds: string[]): Promise<VariantSnapshot[]> {
  if (variantIds.length === 0) return [];
  const rows = await db
    .select({
      variantId: productVariants.id,
      productId: products.id,
      productSlug: products.slug,
      productName: products.name,
      productStatus: products.status,
      categoryVisible: categories.isVisible,
      variantActive: productVariants.isActive,
      colorId: colors.id,
      colorName: colors.name,
      sizeLabel: sizes.label,
      priceCents: productVariants.priceCents,
      compareAtPriceCents: productVariants.compareAtPriceCents,
      stock: productVariants.stock,
    })
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .innerJoin(categories, eq(categories.id, products.categoryId))
    .innerJoin(colors, eq(colors.id, productVariants.colorId))
    .innerJoin(sizes, eq(sizes.id, productVariants.sizeId))
    .where(inArray(productVariants.id, variantIds));
  if (rows.length === 0) return [];

  const productIds = [...new Set(rows.map((r) => r.productId))];
  const [imageRows, promotionByProduct] = await Promise.all([
    db
      .select({ productId: productImages.productId, colorId: productImages.colorId, path: productImages.path })
      .from(productImages)
      .where(inArray(productImages.productId, productIds))
      .orderBy(asc(productImages.position)),
    activePromotionsByProduct(db, productIds, new Date()),
  ]);

  return rows.map((r) => {
    const image =
      imageRows.find((i) => i.productId === r.productId && i.colorId === r.colorId) ??
      imageRows.find((i) => i.productId === r.productId);
    return {
      variantId: r.variantId,
      productSlug: r.productSlug,
      productName: r.productName,
      colorName: r.colorName,
      sizeLabel: r.sizeLabel,
      image: image?.path ?? null,
      priceCents: r.priceCents,
      compareAtPriceCents: r.compareAtPriceCents,
      stock: r.stock,
      promotion: promotionByProduct.get(r.productId) ?? null,
      available: r.productStatus === "active" && r.categoryVisible && r.variantActive,
    };
  });
}
