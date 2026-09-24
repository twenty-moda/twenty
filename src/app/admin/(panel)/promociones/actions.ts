"use server";

import { updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { cacheTags } from "@/lib/cache-tags";
import { getDb } from "@/server/db/client";
import { deletePromotion, getPromotionAdmin, promotionInputSchema, promotionProductSlugs, savePromotion } from "@/server/services/admin-promotions";
import { requireAdmin } from "../../_lib/auth";
import { form, zodFailure, type ActionState } from "../../_lib/action-state";

/** "2026-11-27T00:00" (hora de Lima) → Date. */
const limaDate = (value: string | null) => (value ? new Date(`${value}:00-05:00`) : null);

async function refreshProducts(productIds: string[]) {
  for (const slug of await promotionProductSlugs(getDb(), productIds)) updateTag(cacheTags.product(slug));
  updateTag(cacheTags.catalog);
}

export async function savePromotionAction(id: string | null, _: ActionState, fd: FormData): Promise<ActionState> {
  await requireAdmin();
  const parsed = promotionInputSchema.safeParse({
    name: form.text(fd, "name"),
    description: form.optional(fd, "description"),
    quantity: form.int(fd, "quantity"),
    bundlePriceCents: form.cents(fd, "bundlePrice"),
    isActive: form.bool(fd, "isActive"),
    startsAt: limaDate(form.optional(fd, "startsAt")),
    endsAt: limaDate(form.optional(fd, "endsAt")),
    productIds: fd.getAll("productIds").map(String),
  });
  if (!parsed.success) return zodFailure(parsed.error);
  const db = getDb();
  const before = id ? ((await getPromotionAdmin(db, id))?.productIds ?? []) : [];
  await savePromotion(db, id, parsed.data);
  await refreshProducts([...new Set([...before, ...parsed.data.productIds])]);
  redirect("/admin/promociones?guardado=1");
}

export async function deletePromotionAction(id: string) {
  await requireAdmin();
  const db = getDb();
  const before = (await getPromotionAdmin(db, id))?.productIds ?? [];
  await deletePromotion(db, id);
  await refreshProducts(before);
  redirect("/admin/promociones");
}
