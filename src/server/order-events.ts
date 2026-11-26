import { after } from "next/server";
import { appUrl } from "@/lib/links";
import { getDb } from "./db/client";
import { receiptForStatusChange } from "./services/order-receipts";
import { notifyOrderEvent, type OrderEvent } from "./services/order-notifications";
import { emailPendingOrderReceipts } from "./services/receipt-emails";
import { sunatFromEnv } from "./services/sunat";

/**
 * Manda los emails de pedidos después de responder (con `after`): no demoran el checkout ni el panel, y si Resend
 * falla solo queda en el log. Los eventos van uno tras otro para no pasar el límite de envíos por segundo.
 *
 * Todo cambio de estado pasa por aquí, así que también el comprobante: al entregar se emite (antes del email de
 * «entregado», para darle a SUNAT unos segundos) y le llega al cliente después; al anular, se pide su baja.
 */
export function notifyAfterResponse(...events: OrderEvent[]) {
  if (!events.length) return;
  after(async () => {
    const db = getDb();
    for (const event of events) {
      if (event.type === "status") await receiptForStatusChange(db, event.change, sunatFromEnv());
      try {
        await notifyOrderEvent(db, event, appUrl());
      } catch (error) {
        console.error("[email] pedidos:", error instanceof Error ? error.message : error);
      }
    }
    if (events.some((e) => e.type === "status" && e.change.to === "entregado")) await emailPendingOrderReceipts(db, appUrl());
  });
}
