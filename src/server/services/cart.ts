import { asc, eq, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { OutfitLinePiece, VariantSnapshot } from "@/lib/cart";
import { outfitLineKey, outfitStock, pieceLabel } from "@/lib/outfits";
import type { Db } from "../db/client";
import { categories, colors, outfitPieces, productImages, products, productVariants, sizes } from "../db/schema";
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

export type OutfitRequest = { outfitId: string; variantIds: string[] };
/** Datos frescos de un conjunto del carrito. `variantId` es la clave de la línea (outfitLineKey). */
export type OutfitSnapshot = Omit<VariantSnapshot, "outfit"> & { outfit: { id: string; pieces: (OutfitLinePiece & { productId: string; sku: string })[] } };

/**
 * Precio (el del conjunto), stock (el que alcanza con las variantes elegidas) y disponibilidad de cada conjunto del
 * carrito. Se omite el que ya no se puede comprar tal como está (no existe, cambió de piezas o una variante no es de su
 * pieza): el carrito lo quita y el checkout lo rechaza.
 */
export async function getOutfitSnapshots(db: Db, requests: OutfitRequest[]): Promise<OutfitSnapshot[]> {
  if (requests.length === 0) return [];
  const outfitIds = [...new Set(requests.map((r) => r.outfitId))];
  const variantIds = [...new Set(requests.flatMap((r) => r.variantIds))];
  const pieceProduct = alias(products, "piece_product");
  const pieceCategory = alias(categories, "piece_category");

  const [outfitRows, pieceRows, variantRows] = await Promise.all([
    db
      .select({
        id: products.id,
        slug: products.slug,
        name: products.name,
        kind: products.kind,
        status: products.status,
        priceCents: products.outfitPriceCents,
        categoryVisible: categories.isVisible,
      })
      .from(products)
      .innerJoin(categories, eq(categories.id, products.categoryId))
      .where(inArray(products.id, outfitIds)),
    db
      .select({
        outfitId: outfitPieces.outfitId,
        productId: outfitPieces.productId,
        label: outfitPieces.label,
        productName: pieceProduct.name,
        productSlug: pieceProduct.slug,
        productStatus: pieceProduct.status,
        categoryName: pieceCategory.name,
      })
      .from(outfitPieces)
      .innerJoin(pieceProduct, eq(pieceProduct.id, outfitPieces.productId))
      .innerJoin(pieceCategory, eq(pieceCategory.id, pieceProduct.categoryId))
      .where(inArray(outfitPieces.outfitId, outfitIds))
      .orderBy(asc(outfitPieces.position)),
    db
      .select({
        id: productVariants.id,
        productId: productVariants.productId,
        sku: productVariants.sku,
        colorId: productVariants.colorId,
        colorName: colors.name,
        sizeLabel: sizes.label,
        priceCents: productVariants.priceCents,
        stock: productVariants.stock,
        isActive: productVariants.isActive,
      })
      .from(productVariants)
      .innerJoin(colors, eq(colors.id, productVariants.colorId))
      .innerJoin(sizes, eq(sizes.id, productVariants.sizeId))
      .where(inArray(productVariants.id, variantIds)),
  ]);
  const productIds = [...new Set([...outfitIds, ...pieceRows.map((p) => p.productId)])];
  const imageRows = await db
    .select({ productId: productImages.productId, colorId: productImages.colorId, path: productImages.path })
    .from(productImages)
    .where(inArray(productImages.productId, productIds))
    .orderBy(asc(productImages.position));
  const variantById = new Map(variantRows.map((v) => [v.id, v]));

  const snapshots: OutfitSnapshot[] = [];
  for (const request of requests) {
    const outfit = outfitRows.find((o) => o.id === request.outfitId);
    const pieces = pieceRows.filter((p) => p.outfitId === request.outfitId);
    if (!outfit || outfit.kind !== "outfit" || !outfit.priceCents || pieces.length !== request.variantIds.length) continue;
    const chosen = pieces.map((piece, i) => ({ piece, variant: variantById.get(request.variantIds[i]) }));
    if (chosen.some(({ piece, variant }) => !variant || variant.productId !== piece.productId)) continue;

    const linePieces = chosen.map(({ piece, variant }) => {
      const v = variant!;
      const image =
        imageRows.find((i) => i.productId === piece.productId && i.colorId === v.colorId) ?? imageRows.find((i) => i.productId === piece.productId);
      return {
        variantId: v.id,
        productId: piece.productId,
        sku: v.sku,
        label: pieceLabel(piece.label, piece.categoryName),
        productName: piece.productName,
        productSlug: piece.productSlug,
        colorName: v.colorName,
        sizeLabel: v.sizeLabel,
        image: image?.path ?? null,
        priceCents: v.priceCents,
        stock: v.stock,
      };
    });
    const separately = linePieces.reduce((sum, p) => sum + p.priceCents, 0);
    snapshots.push({
      variantId: outfitLineKey(outfit.id, request.variantIds),
      productSlug: outfit.slug,
      productName: outfit.name,
      colorName: "",
      sizeLabel: "",
      image: imageRows.find((i) => i.productId === outfit.id)?.path ?? linePieces[0].image,
      priceCents: outfit.priceCents,
      compareAtPriceCents: separately > outfit.priceCents ? separately : null,
      stock: outfitStock(linePieces),
      promotion: null,
      outfit: { id: outfit.id, pieces: linePieces },
      // Una pieza puede estar en borrador (se vende solo en el conjunto), pero no archivada.
      available:
        outfit.status === "active" &&
        outfit.categoryVisible &&
        chosen.every(({ piece, variant }) => variant!.isActive && piece.productStatus !== "archived"),
    });
  }
  return snapshots;
}
