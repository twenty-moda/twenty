import { after } from "next/server";
import type { Courier, CourierGuide } from "@/lib/couriers";
import { mathyuFromEnv } from "./services/mathyu-api";

/**
 * Con la API propia, vigila la guía nueva (avisa por webhook cuando se entrega: el pedido pasa a "Entregado" solo) y
 * suelta la anterior si cambió. Va después de responder: en Shalom la API resuelve un captcha y tarda unos segundos.
 * Si falla, solo queda en el log y el pedido se marca entregado a mano, como antes.
 */
export function watchGuideAfterResponse(courier: Courier, previous: CourierGuide | null, next: CourierGuide | null) {
  const client = mathyuFromEnv(courier);
  if (!client) return;
  const changed = previous?.number !== next?.number || previous?.code !== next?.code;
  if (!changed) return;
  after(async () => {
    try {
      if (previous && previous.number !== next?.number) await client.unwatch(courier, previous.number);
      if (next && !(await client.watch(courier, next.number, next.code))) {
        console.warn(`[${courier}] La guía todavía no aparece en el courier: no se vigila (se marcará entregado a mano).`);
      }
    } catch (error) {
      console.error(`[${courier}] No se pudo vigilar la guía`, error instanceof Error ? error.message : error);
    }
  });
}
