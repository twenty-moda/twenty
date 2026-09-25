"use server";

import { z } from "zod";
import type { VariantSnapshot } from "@/lib/cart";
import { checkoutItemSchema } from "@/lib/checkout-schema";
import { getDb } from "@/server/db/client";
import { getOutfitSnapshots, getVariantSnapshots } from "@/server/services/cart";

const itemsSchema = z.array(checkoutItemSchema).max(50);

/** Precio, stock y disponibilidad actuales de las prendas y conjuntos del carrito. */
export async function refreshCart(items: unknown): Promise<VariantSnapshot[]> {
  const parsed = itemsSchema.parse(items);
  const db = getDb();
  const [variants, outfits] = await Promise.all([
    getVariantSnapshots(db, parsed.flatMap((i) => ("variantId" in i ? [i.variantId] : []))),
    getOutfitSnapshots(db, parsed.flatMap((i) => ("outfitId" in i ? [{ outfitId: i.outfitId, variantIds: i.variantIds }] : []))),
  ]);
  return [...variants, ...outfits];
}
