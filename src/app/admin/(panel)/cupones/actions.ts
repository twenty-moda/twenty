"use server";

import { redirect } from "next/navigation";
import { getDb } from "@/server/db/client";
import { couponInputSchema, deleteCoupon, saveCoupon } from "@/server/services/coupons";
import { requireAdmin } from "../../_lib/auth";
import { failure, form, zodFailure, type ActionState } from "../../_lib/action-state";

/** "2026-11-27T00:00" (hora de Lima) → Date. */
const limaDate = (value: string | null) => (value ? new Date(`${value}:00-05:00`) : null);

export async function saveCouponAction(id: string | null, _: ActionState, fd: FormData): Promise<ActionState> {
  await requireAdmin();
  const type = form.text(fd, "type");
  const parsed = couponInputSchema.safeParse({
    code: form.text(fd, "code"),
    description: form.optional(fd, "description"),
    type,
    // Porcentaje: un número entero. Monto: soles → céntimos.
    value: type === "monto" ? form.cents(fd, "value") : form.int(fd, "value"),
    maxDiscountCents: form.cents(fd, "maxDiscount"),
    minSubtotalCents: form.cents(fd, "minSubtotal"),
    usageLimit: form.int(fd, "usageLimit"),
    perCustomerLimit: form.int(fd, "perCustomerLimit"),
    firstPurchaseOnly: form.bool(fd, "firstPurchaseOnly"),
    isActive: form.bool(fd, "isActive"),
    startsAt: limaDate(form.optional(fd, "startsAt")),
    endsAt: limaDate(form.optional(fd, "endsAt")),
  });
  if (!parsed.success) return zodFailure(parsed.error);
  const result = await saveCoupon(getDb(), id, parsed.data);
  if (!result.ok) return failure("Revisa los campos marcados.", { [result.field]: result.message });
  redirect("/admin/cupones?guardado=1");
}

export async function deleteCouponAction(id: string) {
  await requireAdmin();
  await deleteCoupon(getDb(), id);
  redirect("/admin/cupones");
}
