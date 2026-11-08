"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { formatPrice } from "@/lib/money";
import { getDb } from "@/server/db/client";
import { registerExpense, voidExpense } from "@/server/services/expenses";
import { addCashMovement, canManageSession, cashMovementSchema, closeCashSession } from "@/server/services/pos";
import { requireStaff } from "../../_lib/auth";
import { failure, form, success, zodFailure, type ActionState } from "../../_lib/action-state";

const NOT_YOURS = "Esa caja es de otra persona: la maneja quien la abrió o un admin.";

export async function addCashMovementAction(sessionId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireStaff();
  const parsed = cashMovementSchema.safeParse({ type: form.text(fd, "type"), amountCents: form.cents(fd, "amount"), note: form.text(fd, "note") });
  if (!parsed.success) return zodFailure(parsed.error);
  const db = getDb();
  if (!(await canManageSession(db, sessionId, user))) return failure(NOT_YOURS);
  const result = await addCashMovement(db, sessionId, parsed.data, user.id);
  if (!result.ok) return failure(result.message);
  refresh();
  return success(parsed.data.type === "ingreso" ? "Ingreso registrado." : "Egreso registrado.");
}

/** Gasto pagado con el efectivo de esta caja (sale del arqueo y del reporte de cierre). */
export async function addCashExpenseAction(sessionId: string, warehouseId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireStaff();
  const amountCents = form.cents(fd, "amount");
  const result = await registerExpense(
    getDb(),
    {
      warehouseId,
      cashSessionId: sessionId,
      fromCash: true,
      paymentMethod: "efectivo",
      category: form.text(fd, "category"),
      description: form.text(fd, "description"),
      supplierName: form.optional(fd, "supplierName"),
      supplierDocument: form.optional(fd, "supplierDocument"),
      documentType: form.optional(fd, "documentType") ?? "ninguno",
      documentNumber: form.optional(fd, "documentNumber"),
      amountCents: amountCents === null || Number.isNaN(amountCents) ? undefined : amountCents,
    },
    user,
  );
  if (!result.ok) return failure(result.message, result.field ? { [result.field === "amountCents" ? "amount" : result.field]: result.message } : undefined);
  refresh();
  return success(`Gasto #${result.number} anotado: ${amountCents ? formatPrice(amountCents) : ""} salen de la caja.`);
}

export async function voidExpenseAction(expenseId: string, reason: string): Promise<ActionState> {
  const user = await requireStaff();
  const result = await voidExpense(getDb(), { expenseId, reason }, user);
  if (!result.ok) return failure(result.message);
  refresh();
  return success("Gasto anulado.");
}

export async function closeCashAction(sessionId: string, number: number, _: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireStaff();
  const counted = form.cents(fd, "counted");
  if (counted === null || Number.isNaN(counted)) return failure("Escribe cuánto efectivo contaste.");
  const db = getDb();
  if (!(await canManageSession(db, sessionId, user))) return failure(NOT_YOURS);
  const result = await closeCashSession(db, { sessionId, countedCashCents: counted, note: form.optional(fd, "note"), userId: user.id });
  if (!result.ok) return failure(result.message);
  redirect(`/admin/caja/${number}?cerrada=1`);
}
