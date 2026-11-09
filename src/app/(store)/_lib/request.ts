import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { appUrl } from "@/lib/links";
import { getDb } from "@/server/db/client";
import { consumeRateLimit, RATE_LIMITS } from "@/server/services/rate-limit";

/** Limita un formulario público por IP. Se guarda un hash de la IP, nunca la IP. */
export async function allowRequest(action: keyof typeof RATE_LIMITS): Promise<boolean> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
  const hash = createHash("sha256").update(`twenty:${ip}`).digest("hex").slice(0, 32);
  return consumeRateLimit(getDb(), `${action}:${hash}`, RATE_LIMITS[action]);
}

/**
 * Limita por un dato de quien compra (email, celular o documento) en vez de por IP: así no se bloquean entre sí los
 * clientes que comparten la IP de su operador. También se guarda solo el hash. Pasa si todos están dentro del límite.
 */
export async function allowBuyer(action: keyof typeof RATE_LIMITS, values: string[]): Promise<boolean> {
  const db = getDb();
  const results = await Promise.all(
    values.map((value) => {
      const hash = createHash("sha256").update(`twenty:${action}:${value.trim().toLowerCase()}`).digest("hex").slice(0, 32);
      return consumeRateLimit(db, `${action}:${hash}`, RATE_LIMITS[action]);
    }),
  );
  return results.every(Boolean);
}

/** Enlace absoluto para emails y constancias (ver appUrl). */
export const absoluteUrl = (path: string) => `${appUrl()}${path}`;
