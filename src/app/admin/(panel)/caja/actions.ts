"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/server/db/client";
import { addCashMovement, cashMovementSchema, closeCashSession } from "@/server/services/pos";
import { requireAdmin } from "../../_lib/auth";
import { failure, form, success, zodFailure, type ActionState } from "../../_lib/action-state";

export async function addCashMovementAction(sessionId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const parsed = cashMovementSchema.safeParse({ type: form.text(fd, "type"), amountCents: form.cents(fd, "amount"), note: form.text(fd, "note") });
  if (!parsed.success) return zodFailure(parsed.error);
  const result = await addCashMovement(getDb(), sessionId, parsed.data, admin.id);
  if (!result.ok) return failure(result.message);
  refresh();
  return success(parsed.data.type === "ingreso" ? "Ingreso registrado." : "Egreso registrado.");
}

export async function closeCashAction(sessionId: string, number: number, _: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const counted = form.cents(fd, "counted");
  if (counted === null || Number.isNaN(counted)) return failure("Escribe cuánto efectivo contaste.");
  const result = await closeCashSession(getDb(), { sessionId, countedCashCents: counted, note: form.optional(fd, "note"), userId: admin.id });
  if (!result.ok) return failure(result.message);
  redirect(`/admin/caja/${number}`);
}
