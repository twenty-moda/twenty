import { and, count, eq, gt, lt } from "drizzle-orm";
import type { Db } from "../db/client";
import { rateLimitHits } from "../db/schema";

export type RateLimit = { limit: number; windowMinutes: number };

/** Límites de los formularios públicos, por IP. */
export const RATE_LIMITS = {
  contact: { limit: 5, windowMinutes: 60 },
  complaint: { limit: 5, windowMinutes: 60 },
  subscribe: { limit: 10, windowMinutes: 60 },
  tracking: { limit: 20, windowMinutes: 15 },
  /** Subir la captura del pago de Yape/Plin en /pedido/[id]. */
  paymentProof: { limit: 10, windowMinutes: 60 },
  /** Entrar con Google (verificar el token y crear la sesión). */
  login: { limit: 20, windowMinutes: 15 },
  /** Panel con usuario y contraseña, por IP (en la tienda todo el equipo sale por la misma). */
  staffLogin: { limit: 20, windowMinutes: 15 },
  /** Panel con usuario y contraseña, por usuario: nadie prueba contraseñas de una cuenta más de 8 veces seguidas. */
  staffUser: { limit: 8, windowMinutes: 15 },
  /** Probar un cupón en el checkout (que no se puedan adivinar códigos). */
  coupon: { limit: 15, windowMinutes: 15 },
  /**
   * Crear pedidos en el checkout. Cada pedido aparta stock (el de Yape/Plin, hasta que el equipo lo anule) y manda
   * emails: sin límite, un script podría dejar la web agotada con pedidos falsos. Por IP es alto: en los celulares
   * muchos clientes salen por la misma IP de su operador.
   */
  order: { limit: 30, windowMinutes: 60 },
  /** Lo mismo por comprador: cada email, celular y documento, por separado (no depende de la IP). */
  orderBuyer: { limit: 5, windowMinutes: 60 },
  /** Cobrar con Culqi en /pedido/[id], por IP: frena a quien prueba tarjetas robadas contra la tienda. */
  cardPayment: { limit: 30, windowMinutes: 60 },
  /** Lo mismo por pedido (aunque cambie de IP). Cada pago con 3-D Secure son dos llamadas. */
  cardPaymentOrder: { limit: 10, windowMinutes: 60 },
} satisfies Record<string, RateLimit>;

/**
 * Registra un intento y dice si está dentro del límite. `key` = acción + hash de la IP (nunca la IP).
 * En BD porque el volumen de estos formularios es bajo; si hiciera falta, se cambia por Upstash sin tocar a quien llama.
 */
export async function consumeRateLimit(db: Db, key: string, { limit, windowMinutes }: RateLimit, now = new Date()): Promise<boolean> {
  const since = new Date(now.getTime() - windowMinutes * 60 * 1000);
  const [{ hits }] = await db
    .select({ hits: count() })
    .from(rateLimitHits)
    .where(and(eq(rateLimitHits.key, key), gt(rateLimitHits.createdAt, since)));
  if (hits >= limit) return false;
  await db.insert(rateLimitHits).values({ key, createdAt: now });
  // Limpieza oportunista de los intentos viejos de esta clave.
  await db.delete(rateLimitHits).where(and(eq(rateLimitHits.key, key), lt(rateLimitHits.createdAt, since)));
  return true;
}
