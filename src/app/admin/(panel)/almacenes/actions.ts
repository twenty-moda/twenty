"use server";

import { refresh } from "next/cache";
import { getDb } from "@/server/db/client";
import { saveWarehouse, warehouseInputSchema } from "@/server/services/inventory";
import { requireAdmin } from "../../_lib/auth";
import { failure, form, success, zodFailure, type ActionState } from "../../_lib/action-state";

export async function saveWarehouseAction(id: string | null, _: ActionState, fd: FormData): Promise<ActionState> {
  await requireAdmin();
  const parsed = warehouseInputSchema.safeParse({
    name: form.text(fd, "name"),
    code: form.text(fd, "code"),
    address: form.optional(fd, "address"),
    isActive: id ? form.bool(fd, "isActive") : true,
  });
  if (!parsed.success) return zodFailure(parsed.error);
  const result = await saveWarehouse(getDb(), id, parsed.data);
  if (!result.ok) return failure(result.message);
  refresh();
  return success(id ? "Guardado." : "Almacén creado.");
}
