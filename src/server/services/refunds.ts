/**
 * Devoluciones de dinero, con o sin anular el pedido. Con Culqi se devuelve sobre el cargo (total o parcial,
 * POST /v2/refunds); si el cliente pagó por fuera (Yape/Plin con QR) o Culqi no lo permite, el equipo lo devuelve por
 * su cuenta y aquí solo se registra.
 * Para no devolver dos veces, la fila se guarda antes de llamar a Culqi (con el pedido bloqueado) y se confirma
 * después. Si Culqi la rechaza se borra; si no responde, queda "pendiente" (cuenta como devuelta) y el equipo la
 * confirma o la descarta en el panel después de revisar CulqiPanel.
 */
import { and, eq, inArray } from "drizzle-orm";
import { formatPrice } from "@/lib/money";
import { refundableAmounts, soldOutUnits, type RefundReason } from "@/lib/refunds";
import type { Db } from "../db/client";
import { orderItems, orders, orderStatusHistory, payments, productVariants, refundItems, refunds } from "../db/schema";
import type { OrderDetail } from "./orders";
import type { CulqiClient, CulqiResponse } from "./payments";

export type RefundInput = {
  orderId: string;
  /** Céntimos, o "all": todo lo que se puede devolver por ese medio. */
  amount: number | "all";
  /** `manual`: el equipo lo devolvió por su cuenta (Yape, Plin, transferencia) y solo se registra. */
  method: "culqi" | "manual";
  reason: RefundReason;
  note?: string | null;
  customerMessage?: string | null;
  /** Prendas agotadas (solo con el motivo "agotado"). */
  soldOut?: { orderItemId: string; quantity: number }[];
  /** Deja en 0 el stock de las prendas agotadas, para que nadie más las compre. */
  clearStock?: boolean;
  userId: string | null;
};

export type RefundResult =
  | { ok: true; refundId: string; amountCents: number; method: "culqi" | "manual"; productSlugs: string[] }
  /** `pending`: Culqi no respondió; la devolución queda pendiente de confirmar en el panel. */
  | { ok: false; message: string; pending?: boolean };

type RefundOutcome = { kind: "done"; refundId: string } | { kind: "rejected"; message: string } | { kind: "unknown" };

/** 200/201 con el objeto refund = hecha · 4xx = Culqi no la hizo · sin respuesta o 5xx = no se sabe. */
export function interpretRefundResponse(response: CulqiResponse | null): RefundOutcome {
  if (!response || response.status >= 500) return { kind: "unknown" };
  const { status, body } = response;
  if ((status === 200 || status === 201) && body.object === "refund" && typeof body.id === "string") return { kind: "done", refundId: body.id };
  if (status >= 400) return { kind: "rejected", message: String(body.merchant_message ?? body.user_message ?? "") || "Culqi no aceptó la devolución." };
  return { kind: "unknown" };
}

const fail = (message: string) => ({ ok: false as const, message });

export async function refundOrder(db: Db, client: CulqiClient | null, input: RefundInput): Promise<RefundResult> {
  const note = input.note?.trim() || null;
  if (input.reason === "otro" && !note) return fail("Escribe el motivo en la nota interna.");
  const soldOut = input.reason === "agotado" ? (input.soldOut ?? []).filter((i) => i.quantity > 0) : [];
  if (input.reason === "agotado" && soldOut.length === 0) return fail("Marca qué prendas se agotaron.");
  if (input.method === "culqi" && !client) return fail("Culqi no está configurado: devuelve el dinero por tu cuenta y regístralo.");

  const plan = await db.transaction(async (tx) => {
    // Pedido bloqueado: dos devoluciones a la vez (dos admins, doble toque) no pasan de lo que se pagó.
    const [order] = await tx
      .select({ id: orders.id, number: orders.number, status: orders.status, totalCents: orders.totalCents })
      .from(orders)
      .where(eq(orders.id, input.orderId))
      .for("update")
      .limit(1);
    if (!order) return fail("El pedido no existe.");
    const paymentRows = await tx
      .select({ id: payments.id, providerId: payments.providerId, amountCents: payments.amountCents, method: payments.method })
      .from(payments)
      .where(and(eq(payments.orderId, order.id), eq(payments.provider, "culqi"), eq(payments.status, "succeeded")));
    const refundRows = await tx.select({ paymentId: refunds.paymentId, amountCents: refunds.amountCents }).from(refunds).where(eq(refunds.orderId, order.id));
    const history = await tx.select({ status: orderStatusHistory.toStatus }).from(orderStatusHistory).where(eq(orderStatusHistory.orderId, order.id));
    const amounts = refundableAmounts({
      status: order.status,
      totalCents: order.totalCents,
      statuses: history.map((h) => h.status),
      payments: paymentRows,
      refunds: refundRows,
    });
    if (amounts.availableCents <= 0) return fail(amounts.paidCents ? "Ya se devolvió todo lo que pagó el cliente." : "Este pedido no tiene pagos que devolver.");
    const culqi = input.method === "culqi" ? amounts.culqi : null;
    if (input.method === "culqi" && !culqi) return fail("Este pedido no tiene un cobro de Culqi con saldo para devolver.");
    const max = culqi ? culqi.maxCents : amounts.availableCents;
    const amountCents = input.amount === "all" ? max : input.amount;
    if (!Number.isInteger(amountCents) || amountCents <= 0) return fail("Escribe un monto mayor a 0.");
    if (amountCents > max) return fail(`Lo máximo que puedes devolver es ${formatPrice(max)}.`);

    // Prendas agotadas: de este pedido y sin pasar de las unidades que quedan de cada una.
    const soldOutItems: { variantId: string | null; productSlug: string }[] = [];
    if (soldOut.length) {
      const items = await tx
        .select({ id: orderItems.id, quantity: orderItems.quantity, variantId: orderItems.variantId, productSlug: orderItems.productSlug })
        .from(orderItems)
        .where(eq(orderItems.orderId, order.id));
      const previous = await tx
        .select({ orderItemId: refundItems.orderItemId, quantity: refundItems.quantity })
        .from(refundItems)
        .innerJoin(refunds, eq(refunds.id, refundItems.refundId))
        .where(eq(refunds.orderId, order.id));
      const done = soldOutUnits([{ items: previous }]);
      for (const s of soldOut) {
        const item = items.find((i) => i.id === s.orderItemId);
        if (!item || !Number.isInteger(s.quantity) || s.quantity > item.quantity - (done.get(item.id) ?? 0)) {
          return fail("Revisa las prendas agotadas: alguna no es de este pedido o ya se devolvió.");
        }
        soldOutItems.push(item);
      }
    }

    const [refund] = await tx
      .insert(refunds)
      .values({
        orderId: order.id,
        paymentId: culqi?.paymentId ?? null,
        method: input.method,
        status: culqi ? "pendiente" : "hecha",
        amountCents,
        reason: input.reason,
        note,
        customerMessage: input.customerMessage?.trim() || null,
        createdBy: input.userId,
      })
      .returning({ id: refunds.id });
    if (soldOut.length) await tx.insert(refundItems).values(soldOut.map((s) => ({ refundId: refund.id, orderItemId: s.orderItemId, quantity: s.quantity })));
    return {
      ok: true as const,
      refundId: refund.id,
      amountCents,
      order,
      chargeId: culqi ? paymentRows.find((p) => p.id === culqi.paymentId)!.providerId : null,
      soldOutItems,
    };
  });
  if (!plan.ok) return plan;

  if (plan.chargeId) {
    const response = await client!
      .createRefund({
        amount: plan.amountCents,
        charge_id: plan.chargeId,
        reason: "solicitud_comprador",
        metadata: { order_id: plan.order.id, order_number: String(plan.order.number), refund_id: plan.refundId },
      })
      .catch(() => null);
    const outcome = interpretRefundResponse(response);
    if (outcome.kind === "rejected") {
      await db.delete(refunds).where(eq(refunds.id, plan.refundId));
      return fail(`Culqi no hizo la devolución: ${outcome.message}`);
    }
    if (outcome.kind === "unknown") {
      return {
        ok: false,
        pending: true,
        message: "Culqi no respondió y no sabemos si hizo la devolución. Revisa el cargo en CulqiPanel y confírmala o descártala aquí.",
      };
    }
    await db.update(refunds).set({ status: "hecha", providerId: outcome.refundId, raw: response!.body }).where(eq(refunds.id, plan.refundId));
  }

  const variantIds = plan.soldOutItems.map((i) => i.variantId).filter((id): id is string => !!id);
  if (input.clearStock && variantIds.length) await db.update(productVariants).set({ stock: 0 }).where(inArray(productVariants.id, variantIds));
  return {
    ok: true,
    refundId: plan.refundId,
    amountCents: plan.amountCents,
    method: input.method,
    productSlugs: input.clearStock ? [...new Set(plan.soldOutItems.map((i) => i.productSlug))] : [],
  };
}

/** Devolución que Culqi no confirmó: el equipo revisó CulqiPanel y dice si se hizo (queda) o no (se borra). */
export async function resolvePendingRefund(db: Db, input: { orderId: string; refundId: string; done: boolean }) {
  const where = and(eq(refunds.id, input.refundId), eq(refunds.orderId, input.orderId), eq(refunds.status, "pendiente"));
  const rows = input.done
    ? await db.update(refunds).set({ status: "hecha" }).where(where).returning({ id: refunds.id })
    : await db.delete(refunds).where(where).returning({ id: refunds.id });
  return rows.length > 0;
}

export type RefundOptions = Awaited<ReturnType<typeof getRefundOptions>>;
export type RefundableItem = RefundOptions["items"][number];

/** Lo que el panel necesita para devolver: montos, cargo de Culqi y prendas que todavía se pueden marcar agotadas. */
export async function getRefundOptions(db: Db, order: OrderDetail, paymentRows: (typeof payments.$inferSelect)[], culqiEnabled: boolean) {
  const culqiPayments = paymentRows.filter((p) => p.provider === "culqi" && p.status === "succeeded");
  const amounts = refundableAmounts({
    status: order.status,
    totalCents: order.totalCents,
    statuses: order.history.map((h) => h.toStatus),
    payments: culqiPayments,
    refunds: order.refunds,
  });
  const done = soldOutUnits(order.refunds);
  const variantIds = order.items.map((i) => i.variantId).filter((id): id is string => !!id);
  const stock = variantIds.length
    ? await db.select({ id: productVariants.id, stock: productVariants.stock }).from(productVariants).where(inArray(productVariants.id, variantIds))
    : [];
  const items = order.items
    .map((i) => ({
      id: i.id,
      name: i.outfitName ? `${i.productName} (de ${i.outfitName})` : i.productName,
      detail: `${i.colorName} · Talla ${i.sizeLabel} · ${i.sku}`,
      quantity: i.quantity,
      totalCents: i.totalCents,
      available: i.quantity - (done.get(i.id) ?? 0),
      /** Stock actual en la tienda (null si la variante ya no existe). */
      stock: stock.find((s) => s.id === i.variantId)?.stock ?? null,
    }))
    .filter((i) => i.available > 0);
  return { ...amounts, culqi: culqiEnabled ? amounts.culqi : null, shippingCents: order.shippingCents, items };
}
