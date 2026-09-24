"use server";

import { refresh, revalidateTag } from "next/cache";
import { z } from "zod";
import { cacheTags } from "@/lib/cache-tags";
import { ORDER_STATUSES, STATUS_INFO } from "@/lib/order-status";
import { getDb } from "@/server/db/client";
import { changeOrderStatus, updateInternalNote } from "@/server/services/orders";
import { requireAdmin } from "../../_lib/auth";
import { failure, success, type ActionState } from "../../_lib/action-state";

const statusSchema = z.enum(ORDER_STATUSES);

export async function changeStatusAction(orderId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const to = statusSchema.safeParse(formData.get("to"));
  if (!to.success) return failure("Estado no válido.");
  const note = String(formData.get("note") ?? "").slice(0, 500);

  const result = await changeOrderStatus(getDb(), { orderId, to: to.data, note, userId: admin.id });
  if (!result.ok) return failure(result.message);
  if (result.restocked) {
    // Volvió stock a la tienda: se refrescan esas fichas y el catálogo (una talla agotada puede volver).
    for (const slug of result.productSlugs) revalidateTag(cacheTags.product(slug), "max");
    revalidateTag(cacheTags.catalog, "max");
  }
  refresh();
  return success(
    result.restocked ? `Pedido ${STATUS_INFO[to.data].label.toLowerCase()}. Las prendas volvieron al stock.` : `Estado cambiado a “${STATUS_INFO[to.data].label}”.`,
  );
}

export async function saveInternalNoteAction(orderId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();
  await updateInternalNote(getDb(), orderId, String(formData.get("note") ?? "").slice(0, 2000));
  refresh();
  return success("Nota guardada.");
}
