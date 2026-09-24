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
