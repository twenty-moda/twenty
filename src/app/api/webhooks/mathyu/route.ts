import { revalidateTag } from "next/cache";
import { cacheTags } from "@/lib/cache-tags";
import { getDb } from "@/server/db/client";
import { notifyAfterResponse } from "@/server/order-events";
import { parseWebhookEvent, verifyWebhookSignature } from "@/server/services/mathyu-api";
import { markDeliveredByGuide } from "@/server/services/orders";

/**
 * Webhook de la API propia de Shalom y Olva (configurado en la cuenta de TWENTY con PUT /v1/webhooks). URL:
 *   https://twentymoda.vercel.app/api/webhooks/mathyu
 * Cada aviso va firmado con MATHYU_WEBHOOK_SECRET. Cuando una guía cambia se refresca su seguimiento; si se entregó,
 * los pedidos "Enviado" con esa guía pasan a "Entregado" (con el email al cliente, como si lo marcara el equipo).
 */
export async function POST(request: Request) {
  const secret = process.env.MATHYU_WEBHOOK_SECRET;
  if (!secret) return new Response("Webhook no configurado", { status: 503 });

  const raw = await request.text();
  if (!verifyWebhookSignature(raw, request.headers.get("x-mathyu-signature"), secret)) {
    return new Response("No autorizado", { status: 401 });
  }

  let body: unknown = null;
  try {
    body = JSON.parse(raw);
  } catch {
    // Firmado pero ilegible: se ignora (200, así la API no lo reintenta sin fin).
  }
  const event = parseWebhookEvent(body);
  if (!event || event.type === "webhook.test") return Response.json({ ok: true });

  // La página del pedido muestra los pasos nuevos en la próxima visita.
  revalidateTag(cacheTags.courierGuide(event.courier, event.guideNumber), { expire: 0 });
  if (!event.delivered) return Response.json({ ok: true });

  const changes = await markDeliveredByGuide(getDb(), event.courier, event.guideNumber);
  notifyAfterResponse(...changes.map((change) => ({ type: "status" as const, change })));
  return Response.json({ ok: true, delivered: changes.length });
}
