"use server";

import { refresh, revalidateTag } from "next/cache";
import { cacheTags } from "@/lib/cache-tags";
import { getDb } from "@/server/db/client";
import { voidSale } from "@/server/services/pos";
import { sunatFromEnv } from "@/server/services/sunat";
import { requireAdmin } from "../../_lib/auth";
import { failure, form, success, type ActionState } from "../../_lib/action-state";

export async function voidSaleAction(saleId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  // Boleta o factura aceptada: primero se pide la baja a SUNAT.
  const result = await voidSale(getDb(), { saleId, reason: form.text(fd, "reason"), userId: admin.id }, sunatFromEnv());
  if (!result.ok) return failure(result.message);
  for (const slug of result.productSlugs) revalidateTag(cacheTags.product(slug), "max");
  if (result.productSlugs.length) revalidateTag(cacheTags.catalog, "max");
  refresh();
  return success("Venta anulada: las prendas volvieron al stock de la tienda.");
}
