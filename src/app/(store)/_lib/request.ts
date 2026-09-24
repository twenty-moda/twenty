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

/** Enlace absoluto para emails y constancias (ver appUrl). */
export const absoluteUrl = (path: string) => `${appUrl()}${path}`;
