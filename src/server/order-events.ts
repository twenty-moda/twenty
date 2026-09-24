import { after } from "next/server";
import { appUrl } from "@/lib/links";
import { getDb } from "./db/client";
import { notifyOrderEvent, type OrderEvent } from "./services/order-notifications";

/**
 * Manda los emails de pedidos después de responder (con `after`): no demoran el checkout ni el panel, y si Resend
 * falla solo queda en el log. Los eventos van uno tras otro para no pasar el límite de envíos por segundo.
 */
export function notifyAfterResponse(...events: OrderEvent[]) {
  if (!events.length) return;
  after(async () => {
    for (const event of events) {
      try {
        await notifyOrderEvent(getDb(), event, appUrl());
      } catch (error) {
        console.error("[email] pedidos:", error instanceof Error ? error.message : error);
      }
    }
  });
}
