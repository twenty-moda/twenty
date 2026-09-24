/** Estados de un pedido: nombres para el equipo, colores y qué cambios se permiten. */

export const ORDER_STATUSES = [
  "pendiente",
  "por_verificar",
  "pagado",
  "en_preparacion",
  "enviado",
  "entregado",
  "anulado",
  "rechazado",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

type StatusInfo = {
  label: string;
  /** Texto para el cliente en la página de su pedido. */
  customerLabel: string;
  tone: "neutral" | "warning" | "info" | "success" | "danger";
};

export const STATUS_INFO: Record<OrderStatus, StatusInfo> = {
  pendiente: { label: "Pendiente de pago", customerLabel: "Esperando tu pago", tone: "warning" },
  por_verificar: { label: "Pago por verificar", customerLabel: "Estamos verificando tu pago", tone: "warning" },
  pagado: { label: "Pagado", customerLabel: "Pago confirmado", tone: "info" },
  en_preparacion: { label: "En preparación", customerLabel: "Estamos preparando tu pedido", tone: "info" },
  enviado: { label: "Enviado", customerLabel: "Tu pedido va en camino", tone: "info" },
  entregado: { label: "Entregado", customerLabel: "Entregado", tone: "success" },
  anulado: { label: "Anulado", customerLabel: "Pedido anulado", tone: "danger" },
  rechazado: { label: "Rechazado", customerLabel: "Pago rechazado", tone: "danger" },
};

/** Cambios permitidos. Entregado, anulado y rechazado son finales. */
const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pendiente: ["por_verificar", "pagado", "anulado"],
  por_verificar: ["pagado", "rechazado", "pendiente", "anulado"],
  pagado: ["en_preparacion", "enviado", "anulado"],
  en_preparacion: ["enviado", "pagado", "anulado"],
  enviado: ["entregado", "en_preparacion"],
  entregado: [],
  anulado: [],
  rechazado: [],
};

export function allowedTransitions(from: OrderStatus): OrderStatus[] {
  return TRANSITIONS[from];
}

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/** Al anular o rechazar, las prendas vuelven al stock. */
export const RESTOCK_STATUSES: OrderStatus[] = ["anulado", "rechazado"];

/** Pedidos que el equipo tiene que atender. */
export const OPEN_STATUSES: OrderStatus[] = ["pendiente", "por_verificar", "pagado", "en_preparacion", "enviado"];

/** Pedidos que cuentan como venta. */
export const PAID_STATUSES: OrderStatus[] = ["pagado", "en_preparacion", "enviado", "entregado"];

export const formatOrderNumber = (n: number) => `#${n}`;
