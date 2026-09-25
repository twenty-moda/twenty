"use server";

import { refresh, revalidateTag } from "next/cache";
import { z } from "zod";
import { cacheTags } from "@/lib/cache-tags";
import { formatPrice } from "@/lib/money";
import { canTransition, ORDER_STATUSES, STATUS_INFO } from "@/lib/order-status";
import { parseSoles, REFUND_REASONS } from "@/lib/refunds";
import { getDb } from "@/server/db/client";
import { notifyAfterResponse } from "@/server/order-events";
import { emailConfigured } from "@/server/services/email";
import { planOrderEmails } from "@/server/services/order-notifications";
import { parseTrackingInput } from "@/lib/couriers";
import { changeOrderStatus, getOrderById, getOrderCourier, setOrderTracking, updateInternalNote } from "@/server/services/orders";
import { culqiFromEnv } from "@/server/services/payments";
import { refundOrder, resolvePendingRefund, type RefundResult } from "@/server/services/refunds";
import { requireAdmin } from "../../_lib/auth";
import { failure, success, type ActionState } from "../../_lib/action-state";

const statusSchema = z.enum(ORDER_STATUSES);
const refundReasonSchema = z.enum(REFUND_REASONS);

/** Prendas agotadas del formulario: campos "agotada:<id de order_items>" con las unidades. */
function soldOutFromForm(formData: FormData) {
  return [...formData.entries()].flatMap(([key, value]) =>
    key.startsWith("agotada:") && Number(value) > 0 ? [{ orderItemId: key.slice("agotada:".length), quantity: Number(value) }] : [],
  );
}

/** Fichas y catálogo a refrescar cuando cambió el stock en la tienda. */
function revalidateStock(productSlugs: string[]) {
  if (!productSlugs.length) return;
  for (const slug of productSlugs) revalidateTag(cacheTags.product(slug), "max");
  revalidateTag(cacheTags.catalog, "max");
}

export async function changeStatusAction(orderId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const to = statusSchema.safeParse(formData.get("to"));
  if (!to.success) return failure("Estado no válido.");
  const note = String(formData.get("note") ?? "").slice(0, 500);
  const customerMessage = String(formData.get("customerMessage") ?? "").slice(0, 1000);
  const notifyCustomer = formData.get("notifyCustomer") === "on";
  // Shalom u Olva: la guía se guarda antes del cambio de estado, así el email de "enviado" ya la lleva.
  const courier = formData.has("trackingNumber") ? await getOrderCourier(getDb(), orderId) : null;
  if (courier) {
    const tracking = parseTrackingInput(courier, formData.get("trackingNumber"), formData.get("trackingCode"));
    if (!tracking.ok) return failure(tracking.message);
    if (tracking.tracking) await setOrderTracking(getDb(), orderId, tracking.tracking);
  }

  // Anular devolviendo el dinero: primero la devolución. Si no se hace, el pedido no se anula.
  let refund: Extract<RefundResult, { ok: true }> | null = null;
  if (to.data === "anulado" && formData.get("refund") === "on") {
    const reason = refundReasonSchema.safeParse(formData.get("refundReason"));
    if (!reason.success) return failure("Elige el motivo de la devolución.");
    const order = await getOrderById(getDb(), orderId);
    if (!order || !canTransition(order.status, "anulado")) return failure("Ese cambio de estado no está permitido.");
    const method = formData.get("refundMethod") === "culqi" ? "culqi" : "manual";
    const result = await refundOrder(getDb(), method === "culqi" ? culqiFromEnv() : null, {
      orderId,
      amount: "all",
      method,
      reason: reason.data,
      note,
      soldOut: soldOutFromForm(formData),
      clearStock: formData.get("clearStock") === "on",
      userId: admin.id,
    });
    if (!result.ok) {
      if (result.pending) refresh();
      return failure(`${result.message} El pedido no se anuló.`);
    }
    refund = result;
    revalidateStock(result.productSlugs);
  }

  const result = await changeOrderStatus(getDb(), { orderId, to: to.data, note, customerMessage, userId: admin.id });
  if (!result.ok) {
    if (!refund) return failure(result.message);
    notifyAfterResponse({ type: "refund", orderId, refundId: refund.refundId, userId: admin.id, notifyCustomer });
    refresh();
    return failure(`Devolviste ${formatPrice(refund.amountCents)}, pero el pedido no se pudo anular: ${result.message}`);
  }
  // Con devolución, el email de "anulado" ya dice cuánto se devolvió.
  const event = { type: "status" as const, change: result.change, notifyCustomer };
  notifyAfterResponse(event);
  const emailed = emailConfigured() && planOrderEmails(event).customer ? " Le avisamos al cliente por email." : "";
  // Volvió stock a la tienda: se refrescan esas fichas y el catálogo (una talla agotada puede volver).
  if (result.restocked) revalidateStock(result.productSlugs);
  refresh();
  const refunded = refund ? ` ${refund.method === "culqi" ? "Devolviste" : "Registraste la devolución de"} ${formatPrice(refund.amountCents)}.` : "";
  return success(
    (result.restocked ? `Pedido ${STATUS_INFO[to.data].label.toLowerCase()}. Las prendas volvieron al stock.` : `Estado cambiado a “${STATUS_INFO[to.data].label}”.`) +
      refunded +
      emailed,
  );
}

export async function refundAction(orderId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const reason = refundReasonSchema.safeParse(formData.get("refundReason"));
  if (!reason.success) return failure("Elige el motivo de la devolución.");
  const all = formData.get("amountMode") === "todo";
  const amount = all ? "all" : parseSoles(String(formData.get("amount") ?? ""));
  if (amount !== "all" && !Number.isFinite(amount)) return failure("Escribe el monto en soles, por ejemplo 49.90.");
  const method = formData.get("method") === "culqi" ? "culqi" : "manual";
  const notifyCustomer = formData.get("notifyCustomer") === "on";

  const result = await refundOrder(getDb(), method === "culqi" ? culqiFromEnv() : null, {
    orderId,
    amount,
    method,
    reason: reason.data,
    note: String(formData.get("note") ?? "").slice(0, 500),
    customerMessage: String(formData.get("customerMessage") ?? "").slice(0, 1000),
    soldOut: soldOutFromForm(formData),
    clearStock: formData.get("clearStock") === "on",
    userId: admin.id,
  });
  if (!result.ok) {
    // Pendiente: la devolución quedó guardada y se muestra en el pedido para confirmarla.
    if (result.pending) refresh();
    return failure(result.message);
  }
  notifyAfterResponse({ type: "refund", orderId, refundId: result.refundId, userId: admin.id, notifyCustomer });
  revalidateStock(result.productSlugs);
  refresh();
  const emailed = emailConfigured() && notifyCustomer ? " Le avisamos al cliente por email." : "";
  const stock = result.productSlugs.length ? " Las prendas agotadas quedaron sin stock en la tienda." : "";
  return success(
    `${result.method === "culqi" ? "Devolviste" : "Registraste la devolución de"} ${formatPrice(result.amountCents)}${result.method === "culqi" ? " por Culqi" : ""}.${stock}${emailed}`,
  );
}

/** Devolución que Culqi no confirmó: el admin revisó CulqiPanel y dice si se hizo. */
export async function resolveRefundAction(orderId: string, refundId: string, done: boolean): Promise<ActionState> {
  const admin = await requireAdmin();
  const ok = await resolvePendingRefund(getDb(), { orderId, refundId, done });
  if (!ok) return failure("Esa devolución ya no está pendiente.");
  if (done) notifyAfterResponse({ type: "refund", orderId, refundId, userId: admin.id });
  refresh();
  return success(done ? "Devolución confirmada." : "Devolución descartada: ese monto se puede volver a devolver.");
}

export async function saveTrackingAction(orderId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();
  const courier = await getOrderCourier(getDb(), orderId);
  if (!courier) return failure("Este pedido no va por Shalom ni por Olva.");
  const tracking = parseTrackingInput(courier, formData.get("trackingNumber"), formData.get("trackingCode"));
  if (!tracking.ok) return failure(tracking.message);
  await setOrderTracking(getDb(), orderId, tracking.tracking);
  refresh();
  return success(tracking.tracking ? "Guía guardada. El cliente ve el seguimiento en la página de su pedido." : "Guía borrada.");
}

export async function saveInternalNoteAction(orderId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();
  await updateInternalNote(getDb(), orderId, String(formData.get("note") ?? "").slice(0, 2000));
  refresh();
  return success("Nota guardada.");
}
