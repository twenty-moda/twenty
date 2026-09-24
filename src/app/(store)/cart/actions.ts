"use server";

import { z } from "zod";
import { getDb } from "@/server/db/client";
import { getVariantSnapshots } from "@/server/services/cart";

const variantIdsSchema = z.array(z.uuid()).max(50);

/** Precio, stock y disponibilidad actuales de las variantes del carrito. */
export async function refreshCart(variantIds: string[]) {
  const ids = variantIdsSchema.parse(variantIds);
  return getVariantSnapshots(getDb(), ids);
}
