"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/server/db/client";
import { addCashMovement, cashMovementSchema, closeCashSession } from "@/server/services/pos";
import { requireStaff } from "../../_lib/auth";
import { failure, form, success, zodFailure, type ActionState } from "../../_lib/action-state";

export async function addCashMovementAction(sessionId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireStaff();
  const parsed = cashMovementSchema.safeParse({ type: form.text(fd, "type"), amountCents: form.cents(fd, "amount"), note: form.text(fd, "note") });
  if (!parsed.success) return zodFailure(parsed.error);
  const result = await addCashMovement(getDb(), sessionId, parsed.data, user.id);
  if (!result.ok) return failure(result.message);
  refresh();
  return success(parsed.data.type === "ingreso" ? "Ingreso registrado." : "Egreso registrado.");
}

export async function closeCashAction(sessionId: string, number: number, _: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireStaff();
  const counted = form.cents(fd, "counted");
  if (counted === null || Number.isNaN(counted)) return failure("Escribe cuánto efectivo contaste.");
  const result = await closeCashSession(getDb(), { sessionId, countedCashCents: counted, note: form.optional(fd, "note"), userId: user.id });
  if (!result.ok) return failure(result.message);
  redirect(`/admin/caja/${number}`);
}
