"use server";

import { redirect } from "next/navigation";
import { failure, formValues, type ActionState } from "@/lib/action-state";
import { formErrors, trackingDetailSchema, trackingSchema } from "@/lib/public-forms";
import { getDb } from "@/server/db/client";
import { findOrderIdForTracking, getOrderTracking, type OrderTracking } from "@/server/services/orders";
import { allowRequest } from "../_lib/request";

export type TrackingState = ActionState & { order?: OrderTracking };

const TOO_MANY = "Hiciste muchas búsquedas seguidas. Espera unos minutos o escríbenos por WhatsApp.";

/** Estado del pedido con solo el número (sin datos personales: ver getOrderTracking). */
export async function trackOrderAction(_: TrackingState, fd: FormData): Promise<TrackingState> {
  const values = formValues(fd);
  const parsed = trackingSchema.safeParse(values);
  if (!parsed.success) return failure("Revisa el número de pedido.", formErrors(parsed.error), values);
  // Límite por IP: los números son correlativos y así nadie recorre todos los pedidos.
  if (!(await allowRequest("tracking"))) return failure(TOO_MANY, undefined, values);

  const order = await getOrderTracking(getDb(), parsed.data.number);
  if (!order) return failure("No encontramos ese número de pedido. Revísalo en tu email o mensaje de confirmación.", undefined, values);
  return { status: "success", order, values, at: Date.now() };
}

/** Detalle completo (/pedido/[id]): el número más el celular o email de la compra. */
export async function openOrderDetailAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const values = formValues(fd);
  const parsed = trackingDetailSchema.safeParse(values);
  if (!parsed.success) return failure("Revisa los datos.", formErrors(parsed.error), values);
  if (!(await allowRequest("tracking"))) return failure(TOO_MANY, undefined, values);

  const id = await findOrderIdForTracking(getDb(), parsed.data.number, parsed.data.contact);
  if (!id) return failure("Ese celular o email no coincide con el de la compra.", undefined, values);
  redirect(`/pedido/${id}`);
}
