"use server";

import { redirect } from "next/navigation";
import { getDb } from "@/server/db/client";
import { registerExpense } from "@/server/services/expenses";
import { requireStaff } from "../../_lib/auth";
import { failure, form, formValues, type ActionState } from "../../_lib/action-state";

/** Gasto desde el listado: con o sin la caja de quien lo anota, de cualquier día que ya pasó. */
export async function createExpenseAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireStaff();
  const amountCents = form.cents(fd, "amount");
  const result = await registerExpense(
    getDb(),
    {
      warehouseId: form.text(fd, "warehouseId"),
      fromCash: form.bool(fd, "fromCash"),
      paymentMethod: form.text(fd, "paymentMethod"),
      issuedOn: form.optional(fd, "issuedOn"),
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
  if (!result.ok) {
    const field = result.field === "amountCents" ? "amount" : result.field;
    return failure(result.message, field ? { [field]: result.message } : undefined, formValues(fd));
  }
  redirect(`/admin/gastos?nuevo=${result.number}`);
}
