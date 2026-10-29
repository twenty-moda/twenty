/** Punto de venta: medios de pago, documentos y las cuentas de cobro (las usan la pantalla y el servidor). */
import { formatPrice } from "./money";

export const PAYMENT_METHODS = ["efectivo", "yape", "plin", "tarjeta", "transferencia"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  efectivo: "Efectivo",
  yape: "Yape",
  plin: "Plin",
  tarjeta: "Tarjeta",
  transferencia: "Transferencia",
};

export const POS_DOCUMENT_LABEL = { nota_venta: "Nota de venta", boleta: "Boleta", factura: "Factura" } as const;
export type PosDocumentType = keyof typeof POS_DOCUMENT_LABEL;

/** "NV05-123", como en Insaga y en SUNAT (serie-correlativo). */
export const formatDocNumber = (series: string, number: number) => `${series}-${number}`;

/** Total a cobrar: prendas (con sus promos) − descuento de la tienda + envío. */
export function saleTotal(input: { itemsTotalCents: number; manualDiscountCents: number; shippingCents: number }): { ok: true; totalCents: number } | { ok: false; message: string } {
  if (input.manualDiscountCents < 0 || input.shippingCents < 0) return { ok: false, message: "El descuento y el envío no pueden ser negativos." };
  if (input.manualDiscountCents > input.itemsTotalCents) return { ok: false, message: "El descuento es mayor que lo que cuestan las prendas." };
  return { ok: true, totalCents: input.itemsTotalCents - input.manualDiscountCents + input.shippingCents };
}

export type PaymentInput = { method: PaymentMethod; amountCents: number; receivedCents: number | null; reference: string | null };

/**
 * Los pagos tienen que sumar exacto el total. En efectivo `receivedCents` es lo que entregó el cliente: lo que pasa
 * del monto es el vuelto. Los demás medios no dan vuelto.
 */
export function settlePayments(totalCents: number, payments: PaymentInput[]): { ok: true; changeCents: number } | { ok: false; message: string } {
  if (payments.length === 0) return { ok: false, message: "Falta el pago." };
  if (payments.some((p) => !Number.isInteger(p.amountCents) || p.amountCents <= 0)) return { ok: false, message: "Cada pago debe ser mayor que S/ 0." };
  const paid = payments.reduce((s, p) => s + p.amountCents, 0);
  if (paid !== totalCents) return { ok: false, message: `Los pagos suman ${formatPrice(paid)} y el total es ${formatPrice(totalCents)}.` };
  let changeCents = 0;
  for (const p of payments) {
    if (p.method !== "efectivo" || p.receivedCents === null) continue;
    if (p.receivedCents < p.amountCents) return { ok: false, message: `El efectivo recibido (${formatPrice(p.receivedCents)}) no alcanza para ${formatPrice(p.amountCents)}.` };
    changeCents += p.receivedCents - p.amountCents;
  }
  return { ok: true, changeCents };
}
