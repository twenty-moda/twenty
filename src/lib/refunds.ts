/**
 * Devoluciones de dinero de un pedido (con o sin anularlo): motivos y cuentas. Lógica pura: la usan el panel, la
 * página del pedido, los emails y el servidor.
 */
import { PAID_STATUSES, type OrderStatus } from "./order-status";

export const REFUND_REASONS = ["agotado", "cortesia", "cliente", "otro"] as const;
export type RefundReason = (typeof REFUND_REASONS)[number];

/** `label`/`hint`: para el equipo. `customerLabel`: lo que ve el cliente en la página de su pedido. */
export const REFUND_REASON_INFO: Record<RefundReason, { label: string; hint: string; customerLabel: string }> = {
  agotado: { label: "Prenda agotada", hint: "Marca qué prendas no hay: el resto del pedido se envía igual.", customerLabel: "Prenda agotada" },
  cortesia: { label: "Cortesía", hint: "Un descuento o una compensación de TWENTY.", customerLabel: "Cortesía de TWENTY" },
  cliente: { label: "El cliente lo pidió", hint: "Por ejemplo, ya no quiere una prenda o todo el pedido.", customerLabel: "A pedido tuyo" },
  otro: { label: "Otro motivo", hint: "Escribe el motivo en la nota interna.", customerLabel: "Devolución" },
};

type Refund = { paymentId: string | null; amountCents: number };
type Payment = { id: string; amountCents: number; method: string };

export type RefundableAmounts = {
  /** Lo que pagó el cliente (por Culqi, o el total si se pagó por fuera y el equipo lo confirmó). */
  paidCents: number;
  /** Devuelto, contando las devoluciones que Culqi no confirmó (pendientes). */
  refundedCents: number;
  /** Lo que todavía se puede devolver. */
  availableCents: number;
  /** Cargo de Culqi al que se le puede devolver (el de más saldo) y cuánto como máximo. */
  culqi: { paymentId: string; maxCents: number; method: "tarjeta" | "yape" } | null;
};

/**
 * Cuánto se puede devolver. Con cargos de Culqi, lo pagado es la suma de los cargos; sin ellos (Yape/Plin con QR),
 * el total del pedido si el equipo confirmó el pago en algún momento (también si después se anuló).
 */
export function refundableAmounts(input: {
  status: OrderStatus;
  totalCents: number;
  /** Estados por los que pasó el pedido. */
  statuses: OrderStatus[];
  payments: Payment[];
  refunds: Refund[];
}): RefundableAmounts {
  const wasPaid = [input.status, ...input.statuses].some((s) => PAID_STATUSES.includes(s));
  const paidCents = input.payments.length ? input.payments.reduce((sum, p) => sum + p.amountCents, 0) : wasPaid ? input.totalCents : 0;
  const refundedCents = input.refunds.reduce((sum, r) => sum + r.amountCents, 0);
  const availableCents = Math.max(0, paidCents - refundedCents);
  let culqi: RefundableAmounts["culqi"] = null;
  for (const p of input.payments) {
    const left = p.amountCents - input.refunds.filter((r) => r.paymentId === p.id).reduce((sum, r) => sum + r.amountCents, 0);
    const maxCents = Math.min(left, availableCents);
    if (maxCents > 0 && (!culqi || maxCents > culqi.maxCents)) culqi = { paymentId: p.id, maxCents, method: p.method === "yape" ? "yape" : "tarjeta" };
  }
  return { paidCents, refundedCents, availableCents, culqi };
}

/** Unidades de cada prenda del pedido ya devueltas por agotadas (id de order_items → cantidad). */
export function soldOutUnits(refunds: { items: { orderItemId: string; quantity: number }[] }[]): Map<string, number> {
  const units = new Map<string, number>();
  for (const r of refunds) for (const i of r.items) units.set(i.orderItemId, (units.get(i.orderItemId) ?? 0) + i.quantity);
  return units;
}

/**
 * Monto sugerido al devolver prendas agotadas: lo que se pagó por cada una (con su parte de la promo o del
 * conjunto). Si ya no queda nada por enviar, también el envío.
 */
export function suggestSoldOutRefund(
  items: { id: string; quantity: number; totalCents: number; available: number }[],
  selected: Record<string, number>,
  shippingCents: number,
): number {
  let cents = 0;
  let left = 0;
  for (const item of items) {
    const qty = Math.min(selected[item.id] ?? 0, item.available);
    cents += Math.round((item.totalCents * qty) / item.quantity);
    left += item.available - qty;
  }
  return cents > 0 && left === 0 ? cents + shippingCents : cents;
}

/** Texto para montos escritos a mano: "50", "49.90", "S/ 49,90" → céntimos; NaN si no es un número. */
export function parseSoles(raw: string): number {
  const clean = raw.replace(/s\/\.?/i, "").replace(/\s/g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return Number.NaN;
  return Math.round(Number(clean) * 100);
}
