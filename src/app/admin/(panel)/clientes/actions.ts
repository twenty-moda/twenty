"use server";

import { refresh } from "next/cache";
import { getDb } from "@/server/db/client";
import { updateCustomerNotes } from "@/server/services/orders";
import { requireAdmin } from "../../_lib/auth";
import { success, type ActionState } from "../../_lib/action-state";

export async function saveCustomerNotesAction(customerId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();
  await updateCustomerNotes(getDb(), customerId, String(formData.get("notes") ?? "").slice(0, 2000));
  refresh();
  return success("Notas guardadas.");
}
