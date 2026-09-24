import { timingSafeEqual } from "node:crypto";
import { getDb } from "@/server/db/client";
import { notifyAfterResponse } from "@/server/order-events";
import { culqiFromEnv, handleCulqiEvent } from "@/server/services/payments";

/**
 * Webhook de Culqi (configurarlo en CulqiPanel → Eventos → Webhooks). URL:
 *   https://twentymoda.com/api/webhooks/culqi?key=<CULQI_WEBHOOK_SECRET>
 * o con autenticación básica activada en Culqi (usuario "culqi", contraseña = CULQI_WEBHOOK_SECRET).
 * Aunque el secreto sea correcto, el servicio vuelve a consultar el cargo en la API antes de marcar nada.
 */
export async function POST(request: Request) {
  const secret = process.env.CULQI_WEBHOOK_SECRET;
  if (!secret) return new Response("Webhook no configurado", { status: 503 });

  const url = new URL(request.url);
  const basic = request.headers.get("authorization")?.match(/^Basic (.+)$/)?.[1];
  const basicPassword = basic ? Buffer.from(basic, "base64").toString().split(":").slice(1).join(":") : null;
  if (!safeEqual(url.searchParams.get("key"), secret) && !safeEqual(basicPassword, secret)) {
    return new Response("No autorizado", { status: 401 });
  }

  const client = culqiFromEnv();
  if (!client) return new Response("Culqi no configurado", { status: 503 });
  const payload = await request.json().catch(() => null);
  const { change, ...result } = await handleCulqiEvent(getDb(), client, payload);
  if (change) notifyAfterResponse({ type: "status", change });
  // 200 también para eventos ignorados: así Culqi no los reintenta sin fin.
  return Response.json(result);
}

function safeEqual(value: string | null | undefined, expected: string) {
  if (!value) return false;
  const a = Buffer.from(value);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
