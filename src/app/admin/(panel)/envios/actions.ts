"use server";

import { refresh, updateTag } from "next/cache";
import { z } from "zod";
import { cacheTags } from "@/lib/cache-tags";
import { getDb } from "@/server/db/client";
import { setDistrictDeliveryPrice, updateShippingMethod } from "@/server/services/shipping";
import { requireAdmin } from "../../_lib/auth";
import { failure, form, success, type ActionState } from "../../_lib/action-state";

export async function saveShippingMethodAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  await requireAdmin();
  const name = form.text(fd, "name");
  if (name.length < 2) return failure("Escribe el nombre.");
  await updateShippingMethod(getDb(), id, {
    name,
    description: form.optional(fd, "description"),
    details: form
      .text(fd, "details")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean),
    isActive: form.bool(fd, "isActive"),
  });
  updateTag(cacheTags.shipping);
  refresh();
  return success("Guardado. El checkout ya muestra el cambio.");
}

const pricesSchema = z.array(z.object({ ubigeo: z.string().regex(/^\d{6}$/), priceCents: z.number().int().min(0).nullable() })).max(2000);

/** priceCents null = ese distrito deja de tener delivery Lima. */
export async function saveDeliveryPricesAction(updates: unknown): Promise<ActionState> {
  await requireAdmin();
  const parsed = pricesSchema.safeParse(updates);
  if (!parsed.success) return failure("Hay un precio que no es válido.");
  const db = getDb();
  for (const u of parsed.data) await setDistrictDeliveryPrice(db, u.ubigeo, u.priceCents);
  updateTag(cacheTags.shipping);
  refresh();
  return success(`${parsed.data.length} ${parsed.data.length === 1 ? "distrito actualizado" : "distritos actualizados"}.`);
}
