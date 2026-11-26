/**
 * Lo que va en el comprobante de un pedido de la web (pedido de TWENTY, 26/11/2026). Se emite al entregar: las
 * prendas que el cliente se llevó (sin las devueltas por agotadas) al precio con la promo, el envío, y un descuento
 * que junta el cupón y cualquier otra devolución de dinero. El total es lo que el cliente pagó y no se le devolvió.
 */
import { soldOutUnits } from "./refunds";
import type { PosDocumentType } from "./pos";

export type ReceiptOrderItem = {
  id: string;
  variantId: string | null;
  sku: string;
  productName: string;
  colorName: string;
  sizeLabel: string;
  quantity: number;
  /** Lo de la línea con la promo, sin el cupón. */
  totalCents: number;
};

export type ReceiptOrder = {
  items: ReceiptOrderItem[];
  /** Todas las devoluciones (las pendientes de confirmar cuentan como hechas). */
  refunds: { amountCents: number; items: { orderItemId: string; quantity: number }[] }[];
  shippingCents: number;
  totalCents: number;
};

export type ReceiptLine = Omit<ReceiptOrderItem, "id">;
export type ReceiptAmounts = { items: ReceiptLine[]; discountCents: number; shippingCents: number; totalCents: number };

export function orderReceiptAmounts(order: ReceiptOrder): ReceiptAmounts | null {
  const soldOut = soldOutUnits(order.refunds);
  const items: ReceiptLine[] = order.items.flatMap((item) => {
    const quantity = item.quantity - (soldOut.get(item.id) ?? 0);
    if (quantity <= 0) return [];
    const { variantId, sku, productName, colorName, sizeLabel } = item;
    return [{ variantId, sku, productName, colorName, sizeLabel, quantity, totalCents: Math.round((item.totalCents * quantity) / item.quantity) }];
  });
  const kept = order.totalCents - order.refunds.reduce((sum, r) => sum + r.amountCents, 0);
  if (!items.length || kept <= 0) return null;
  const itemsCents = items.reduce((sum, i) => sum + i.totalCents, 0);
  const shippingCents = Math.min(order.shippingCents, kept);
  // El descuento sale de las prendas. Si se llevaría todo lo que cuestan, no queda una venta que facturar.
  const discountCents = Math.max(0, itemsCents + shippingCents - kept);
  if (discountCents >= itemsCents) return null;
  return { items, discountCents, shippingCents, totalCents: itemsCents - discountCents + shippingCents };
}

/** El comprobante del pedido: el que eligió el equipo en el panel o, si no, el del checkout. */
export function orderReceiptType(order: { receiptType: string | null; invoiceType: "boleta" | "factura" }): PosDocumentType {
  return order.receiptType === "nota_venta" || order.receiptType === "boleta" || order.receiptType === "factura" ? order.receiptType : order.invoiceType;
}
