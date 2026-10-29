"use server";

import { updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { cacheTags } from "@/lib/cache-tags";
import { getDb } from "@/server/db/client";
import { operationInputSchema, registerOperation } from "@/server/services/inventory";
import { requireAdmin } from "../../_lib/auth";
import { failure, type ActionState } from "../../_lib/action-state";

export async function registerOperationAction(input: unknown): Promise<ActionState> {
  const admin = await requireAdmin();
  const parsed = operationInputSchema.safeParse(input);
  if (!parsed.success) return failure(parsed.error.issues[0].message);
  const result = await registerOperation(getDb(), parsed.data, admin.id);
  if (!result.ok) return failure(result.message);
  // Si tocó el almacén de la web, la tienda muestra el stock nuevo.
  for (const slug of result.productSlugs) updateTag(cacheTags.product(slug));
  if (result.productSlugs.length) updateTag(cacheTags.catalog);
  redirect(`/admin/movimientos/${result.number}`);
}
