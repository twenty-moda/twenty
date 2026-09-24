"use server";

import { redirect } from "next/navigation";
import { failure, formValues, type ActionState } from "@/lib/action-state";
import { formErrors, trackingSchema } from "@/lib/public-forms";
import { getDb } from "@/server/db/client";
import { findOrderIdForTracking } from "@/server/services/orders";
import { allowRequest } from "../_lib/request";

export async function trackOrderAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const values = formValues(fd);
  const parsed = trackingSchema.safeParse(values);
  if (!parsed.success) return failure("Revisa los datos.", formErrors(parsed.error), values);
  if (!(await allowRequest("tracking"))) return failure("Hiciste muchas búsquedas seguidas. Espera unos minutos o escríbenos por WhatsApp.", undefined, values);

  const id = await findOrderIdForTracking(getDb(), parsed.data.number, parsed.data.contact);
  if (!id) {
    return failure("No encontramos un pedido con esos datos. Revisa el número y usa el mismo celular o email con que compraste.", undefined, values);
  }
  redirect(`/pedido/${id}`);
}
