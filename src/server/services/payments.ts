/**
 * Pago con Culqi (tarjeta y Yape). El navegador obtiene un token con el Culqi Checkout; aquí se crea el
 * cargo con la llave secreta. Contrato de la API de cargos (POST /v2/charges):
 *   201 → cargo exitoso · 200 + action_code "REVIEW" → pide 3-D Secure · otro → rechazado.
 * El webhook nunca confía en su cuerpo: vuelve a consultar el cargo en la API antes de marcar el pedido.
 * Devoluciones (POST /v2/refunds, total o parcial de un cargo): ver refunds.ts.
 */
import { eq } from "drizzle-orm";
import { PAID_STATUSES, type OrderStatus } from "@/lib/order-status";
import type { Db } from "../db/client";
import { orders, payments } from "../db/schema";
import { changeOrderStatus, type StatusChange } from "./orders";

const CULQI_API = "https://api.culqi.com/v2";

type Json = Record<string, unknown>;
export type CulqiResponse = { status: number; body: Json };
export type CulqiClient = {
  createCharge(body: Json): Promise<CulqiResponse>;
  getCharge(id: string): Promise<CulqiResponse>;
  createRefund(body: Json): Promise<CulqiResponse>;
};

export function culqiClient(secretKey: string, fetchImpl: typeof fetch = fetch): CulqiClient {
  const call = async (path: string, init?: RequestInit): Promise<CulqiResponse> => {
    const res = await fetchImpl(`${CULQI_API}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${secretKey}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(25_000),
    });
    const body = (await res.json().catch(() => ({}))) as Json;
    return { status: res.status, body };
  };
  return {
    createCharge: (body) => call("/charges", { method: "POST", body: JSON.stringify(body) }),
    getCharge: (id) => call(`/charges/${encodeURIComponent(id)}`),
    createRefund: (body) => call("/refunds", { method: "POST", body: JSON.stringify(body) }),
  };
}

/** Cliente con la llave de las variables de entorno; null si Culqi no está configurado. */
export function culqiFromEnv(): CulqiClient | null {
  const key = process.env.CULQI_SECRET_KEY;
  return key ? culqiClient(key) : null;
}

export type ChargeOutcome =
  | { kind: "paid"; chargeId: string }
  | { kind: "review" }
  | { kind: "declined"; userMessage: string; merchantMessage: string | null };

const FALLBACK_MESSAGE = "No se pudo procesar el pago. Revisa los datos o intenta con otra tarjeta o con Yape.";

export function interpretChargeResponse({ status, body }: CulqiResponse): ChargeOutcome {
  if (status === 201 && body.object === "charge" && typeof body.id === "string") return { kind: "paid", chargeId: body.id };
  if (status === 200 && body.action_code === "REVIEW") return { kind: "review" };
  const outcome = (body.outcome ?? {}) as Json;
  const userMessage = String(body.user_message ?? outcome.user_message ?? "") || FALLBACK_MESSAGE;
  return { kind: "declined", userMessage, merchantMessage: (body.merchant_message as string | undefined) ?? null };
}

export type Authentication3DS = { eci: string; xid: string; cavv: string; protocolVersion: string; directoryServerTransactionId: string };
export type PayInput = {
  orderId: string;
  tokenId: string;
  email: string;
  deviceId?: string | null;
  authentication3DS?: Authentication3DS | null;
};
export type PayResult =
  /** `change`: el pedido pasó a pagado en esta llamada (para los emails; no se devuelve al navegador). */
  | { status: "paid"; change?: StatusChange }
  | { status: "review" }
  | { status: "declined"; message: string }
  | { status: "not_payable"; message: string };

const PAYABLE: OrderStatus[] = ["pendiente", "por_verificar"];

type AntifraudOrder = Pick<typeof orders.$inferSelect, "customerName" | "phone" | "address" | "agencyName" | "district">;

/**
 * Datos del comprador para el antifraude de Culqi. Si un campo se sale de su largo, Culqi rechaza el cargo entero
 * (400 y al cliente "Hubo algunos problemas al intentar validar tu compra"), y el nombre de una agencia de Shalom
 * u Olva pasa de 100 caracteres. Largos medidos contra la API: nombre y apellido 2–50, dirección 5–100,
 * ciudad 2–30, celular 5–15 dígitos.
 */
export function antifraudDetails(order: AntifraudOrder, deviceId?: string | null) {
  const [firstName = "", ...rest] = order.customerName.trim().split(/\s+/);
  const lastName = rest.join(" ") || firstName;
  const address = order.address ?? (order.agencyName ? `Agencia ${order.agencyName}` : "Recojo en tienda");
  return {
    first_name: fit(firstName, 2, 50, "Cliente"),
    last_name: fit(lastName, 2, 50, "Cliente"),
    phone_number: order.phone.replace(/\D/g, "").slice(-15),
    address: fit(address, 5, 100, "Sin dirección"),
    address_city: fit(order.district ?? "", 2, 30, "Lima"),
    country_code: "PE",
    ...(deviceId ? { device_finger_print_id: deviceId } : {}),
  };
}

/** Culqi cuenta caracteres (no bytes): lo largo se corta en `max` y lo que no llega a `min` se cambia por `fallback`. */
function fit(text: string, min: number, max: number, fallback: string): string {
  const chars = Array.from(text.replace(/\s+/g, " ").trim());
  if (chars.length < min) return fallback;
  return chars.slice(0, max).join("").trimEnd();
}

export async function payOrderWithCulqi(db: Db, client: CulqiClient, input: PayInput): Promise<PayResult> {
  const [order] = await db.select().from(orders).where(eq(orders.id, input.orderId)).limit(1);
  if (!order) return { status: "not_payable", message: "No encontramos el pedido." };
  if (PAID_STATUSES.includes(order.status)) return { status: "paid" };
  if (!PAYABLE.includes(order.status)) return { status: "not_payable", message: "Este pedido ya no se puede pagar." };

  const response = await client.createCharge({
    amount: order.totalCents,
    currency_code: "PEN",
    email: input.email,
    source_id: input.tokenId,
    capture: true,
    description: `Pedido #${order.number} TWENTY`,
    metadata: { order_id: order.id, order_number: String(order.number) },
    antifraud_details: antifraudDetails(order, input.deviceId),
    ...(input.authentication3DS ? { authentication_3DS: input.authentication3DS } : {}),
  });

  const outcome = interpretChargeResponse(response);
  if (outcome.kind === "review") return { status: "review" };
  if (outcome.kind === "declined") {
    // El mensaje para el comercio dice el motivo (fondos, antifraude, un campo inválido) y no trae datos personales.
    console.warn(`[culqi] cargo rechazado, pedido #${order.number} (HTTP ${response.status}):`, outcome.merchantMessage);
    return { status: "declined", message: outcome.userMessage };
  }
  const { change } = await recordCulqiPayment(db, {
    orderId: order.id,
    chargeId: outcome.chargeId,
    amountCents: order.totalCents,
    // Los tokens de Yape empiezan con "ype_", los de tarjeta con "tkn_".
    method: input.tokenId.startsWith("ype_") ? "yape" : "tarjeta",
    raw: response.body,
  });
  return { status: "paid", change };
}

/**
 * Registra el cargo y marca el pedido como pagado. Idempotente: si el cargo ya estaba registrado
 * (por el checkout o por el webhook), no hace nada.
 */
export async function recordCulqiPayment(
  db: Db,
  input: { orderId: string; chargeId: string; amountCents: number; method: "tarjeta" | "yape"; raw: unknown },
): Promise<{ newlyPaid: boolean; change?: StatusChange }> {
  const inserted = await db
    .insert(payments)
    .values({
      orderId: input.orderId,
      provider: "culqi",
      providerId: input.chargeId,
      method: input.method,
      status: "succeeded",
      amountCents: input.amountCents,
      raw: input.raw as object,
    })
    .onConflictDoNothing({ target: payments.providerId })
    .returning({ id: payments.id });
  if (inserted.length === 0) return { newlyPaid: false };
  const result = await changeOrderStatus(db, {
    orderId: input.orderId,
    to: "pagado",
    note: `Pago con ${input.method === "yape" ? "Yape" : "tarjeta"} por Culqi (${input.chargeId})`,
    userId: null,
  });
  return result.ok ? { newlyPaid: true, change: result.change } : { newlyPaid: false };
}

export type WebhookResult = { handled: boolean; reason: string; orderId?: string; change?: StatusChange };

/** Evento de Culqi → si es un cargo exitoso de un pedido nuestro, lo registra (una sola vez). */
export async function handleCulqiEvent(db: Db, client: CulqiClient, payload: unknown): Promise<WebhookResult> {
  const event = (payload ?? {}) as Json;
  let data: unknown = event.data;
  if (typeof data === "string") {
    try {
      data = JSON.parse(data);
    } catch {
      data = null;
    }
  }
  const chargeId = (data as Json | null)?.id;
  if (typeof event.type !== "string" || !event.type.startsWith("charge.") || typeof chargeId !== "string" || !chargeId.startsWith("chr_")) {
    return { handled: false, reason: "evento ignorado" };
  }

  // Verificación: el estado real del cargo se consulta en la API con la llave secreta.
  const { status, body: charge } = await client.getCharge(chargeId);
  if (status !== 200 || charge.object !== "charge") return { handled: false, reason: "cargo no encontrado en Culqi" };
  const outcome = (charge.outcome ?? {}) as Json;
  const orderId = ((charge.metadata ?? {}) as Json).order_id;
  if (outcome.type !== "venta_exitosa") return { handled: false, reason: "cargo no exitoso" };
  if (typeof orderId !== "string") return { handled: false, reason: "cargo sin pedido" };

  const [order] = await db.select({ id: orders.id, totalCents: orders.totalCents }).from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) return { handled: false, reason: "pedido no existe" };
  if (order.totalCents !== charge.amount) return { handled: false, reason: "el monto no coincide con el pedido", orderId };

  const source = (charge.source ?? {}) as Json;
  const method = typeof source.id === "string" && source.id.startsWith("ype_") ? "yape" : "tarjeta";
  const { newlyPaid, change } = await recordCulqiPayment(db, { orderId, chargeId, amountCents: order.totalCents, method, raw: charge });
  return { handled: true, reason: newlyPaid ? "pedido marcado como pagado" : "ya estaba registrado", orderId, change };
}

export async function listOrderPayments(db: Db, orderId: string) {
  return db.select().from(payments).where(eq(payments.orderId, orderId));
}
