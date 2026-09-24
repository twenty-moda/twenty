import { asc, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "../db/client";
import { categories, products, promotionProducts, promotions } from "../db/schema";

export type PromotionState = "apagada" | "termino" | "programada" | "activa";

export async function listPromotionsAdmin(db: Db, now = new Date()) {
  const rows = await db
    .select({
      id: promotions.id,
      name: promotions.name,
      description: promotions.description,
      quantity: promotions.quantity,
      bundlePriceCents: promotions.bundlePriceCents,
      isActive: promotions.isActive,
      startsAt: promotions.startsAt,
      endsAt: promotions.endsAt,
      products: sql<number>`(select count(*)::int from ${promotionProducts} pp where pp.promotion_id = ${promotions.id})`,
    })
    .from(promotions)
    .orderBy(desc(promotions.isActive), asc(promotions.name));
  return rows.map((p) => ({
    ...p,
    state: (!p.isActive ? "apagada" : p.endsAt && p.endsAt < now ? "termino" : p.startsAt && p.startsAt > now ? "programada" : "activa") as PromotionState,
  }));
}

export async function getPromotionAdmin(db: Db, id: string) {
  const [promotion] = await db.select().from(promotions).where(eq(promotions.id, id)).limit(1);
  if (!promotion) return null;
  const rows = await db.select({ productId: promotionProducts.productId }).from(promotionProducts).where(eq(promotionProducts.promotionId, id));
  return { ...promotion, productIds: rows.map((r) => r.productId) };
}

/** Productos para elegir en una promo, con su categoría y precio mínimo. */
export async function listPromotableProducts(db: Db) {
  return db
    .select({
      id: products.id,
      name: products.name,
      status: products.status,
      categoryName: categories.name,
      minPrice: sql<number | null>`(select min(v.price_cents) from product_variants v where v.product_id = ${products.id} and v.is_active)`,
    })
    .from(products)
    .innerJoin(categories, eq(categories.id, products.categoryId))
    .orderBy(asc(categories.position), asc(products.name));
}

export const promotionInputSchema = z
  .object({
    name: z.string().trim().min(2, "Ponle un nombre").max(80),
    description: z.string().trim().max(300).nullable().optional(),
    quantity: z.number().int().min(2, "La promo es desde 2 prendas").max(20),
    bundlePriceCents: z.number().int().positive("Escribe el precio del paquete"),
    isActive: z.boolean(),
    startsAt: z.date().nullable(),
    endsAt: z.date().nullable(),
    productIds: z.array(z.uuid()).min(1, "Elige al menos un producto"),
  })
  .refine((p) => !p.startsAt || !p.endsAt || p.endsAt > p.startsAt, { path: ["endsAt"], message: "El fin debe ser después del inicio" });
export type PromotionInput = z.infer<typeof promotionInputSchema>;

export async function savePromotion(db: Db, id: string | null, input: PromotionInput): Promise<{ id: string }> {
  return db.transaction(async (tx) => {
    const values = {
      name: input.name,
      description: input.description || null,
      type: "bundle_price" as const,
      quantity: input.quantity,
      bundlePriceCents: input.bundlePriceCents,
      isActive: input.isActive,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
    };
    let promotionId = id;
    if (promotionId) await tx.update(promotions).set(values).where(eq(promotions.id, promotionId));
    else [{ id: promotionId }] = await tx.insert(promotions).values(values).returning({ id: promotions.id });
    await tx.delete(promotionProducts).where(eq(promotionProducts.promotionId, promotionId!));
    await tx.insert(promotionProducts).values(input.productIds.map((productId) => ({ promotionId: promotionId!, productId })));
    return { id: promotionId! };
  });
}

export async function deletePromotion(db: Db, id: string) {
  await db.delete(promotions).where(eq(promotions.id, id));
}

/** Slugs de los productos de una promo (para refrescar sus fichas). */
export async function promotionProductSlugs(db: Db, productIds: string[]) {
  if (productIds.length === 0) return [];
  const rows = await db.select({ slug: products.slug }).from(products).where(inArray(products.id, productIds));
  return rows.map((r) => r.slug);
}
