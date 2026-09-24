"use server";

import { revalidateTag } from "next/cache";
import { cacheTags } from "@/lib/cache-tags";
import { checkoutSchema, fieldErrors, type CheckoutFieldErrors } from "@/lib/checkout-schema";
import { culqiConfig } from "@/lib/culqi-config";
import { getDb } from "@/server/db/client";
import { notifyAfterResponse } from "@/server/order-events";
import { getSiteSettings } from "@/server/services/content";
import { expireUnpaidCardOrders, placeOrder } from "@/server/services/orders";

export type PlaceOrderState =
  | { ok: true; orderId: string; payNow: boolean }
  | { ok: false; errors: CheckoutFieldErrors; outOfStock?: string[] };

export async function placeOrderAction(raw: unknown): Promise<PlaceOrderState> {
  const parsed = checkoutSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };
  const db = getDb();
  const { payments } = await getSiteSettings(db);
  if (parsed.data.paymentMethod === "tarjeta" && !(culqiConfig() && payments.culqiEnabled)) {
    return { ok: false, errors: { paymentMethod: "El pago con tarjeta no está disponible ahora. Elige otra forma de pago." } };
  }
  if (parsed.data.paymentMethod === "yape_plin" && !payments.walletEnabled) {
    return { ok: false, errors: { paymentMethod: "El pago con Yape o Plin por QR no está disponible ahora. Elige otra forma de pago." } };
  }

  // Antes de vender, se libera el stock de los pedidos con tarjeta que no se pagaron en 60 minutos
  // (en el plan Hobby de Vercel el cron corre solo una vez al día; así el stock no queda retenido).
  const expired = await expireUnpaidCardOrders(db);
  for (const slug of expired.productSlugs) revalidateTag(cacheTags.product(slug), "max");
  if (expired.productSlugs.length) revalidateTag(cacheTags.catalog, "max");
  notifyAfterResponse(...expired.changes.map((change) => ({ type: "status" as const, change })));

  const result = await placeOrder(db, parsed.data);
  if (!result.ok) {
    switch (result.code) {
      case "out_of_stock":
      case "unavailable":
        return {
          ok: false,
          outOfStock: result.variantIds,
          errors: { form: "Alguna prenda se agotó mientras comprabas. Revisa tu carrito y vuelve a intentarlo." },
        };
      case "shipping":
        return { ok: false, errors: { shippingMethod: result.message } };
      case "address":
        return { ok: false, errors: { address: result.message } };
      case "agency":
        return { ok: false, errors: { agencyName: result.message } };
    }
  }

  // El stock cambió: se refrescan las fichas vendidas (y el catálogo si alguna talla se agotó).
  for (const slug of result.productSlugs) revalidateTag(cacheTags.product(slug), "max");
  if (result.soldOut) revalidateTag(cacheTags.catalog, "max");
  notifyAfterResponse({ type: "placed", orderId: result.orderId, paymentMethod: parsed.data.paymentMethod });
  return { ok: true, orderId: result.orderId, payNow: parsed.data.paymentMethod === "tarjeta" };
}
