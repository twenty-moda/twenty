"use server";

import { refresh, updateTag } from "next/cache";
import { cacheTags } from "@/lib/cache-tags";
import { getDb } from "@/server/db/client";
import { inventoryUpdateSchema, updateInventory } from "@/server/services/admin-products";
import { requireAdmin } from "../../_lib/auth";
import { failure, success, type ActionState } from "../../_lib/action-state";

export async function saveInventoryAction(updates: unknown): Promise<ActionState> {
  await requireAdmin();
  const parsed = inventoryUpdateSchema.max(500).safeParse(updates);
  if (!parsed.success) return failure("Revisa los precios y el stock: hay un valor que no es válido.");
  const slugs = await updateInventory(getDb(), parsed.data);
  for (const slug of slugs) updateTag(cacheTags.product(slug));
  updateTag(cacheTags.catalog);
  refresh();
  return success(`${parsed.data.length} ${parsed.data.length === 1 ? "cambio guardado" : "cambios guardados"}. La tienda ya los muestra.`);
}
