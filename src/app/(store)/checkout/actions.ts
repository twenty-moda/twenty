"use server";

import { revalidateTag } from "next/cache";
import { after } from "next/server";
import { cacheTags } from "@/lib/cache-tags";
import { checkoutSchema, fieldErrors, type CheckoutFieldErrors } from "@/lib/checkout-schema";
import { culqiConfig } from "@/lib/culqi-config";
import { getDb } from "@/server/db/client";
import { notifyAfterResponse } from "@/server/order-events";
import { linkCustomerToAccount, rememberCheckoutAddress } from "@/server/services/accounts";
import { getSiteSettings } from "@/server/services/content";
import { expireUnpaidCardOrders, placeOrder } from "@/server/services/orders";
import { resolveAgency } from "@/server/services/couriers";
import { agencyLabel, methodCourier } from "@/lib/couriers";
import { getCourierAgencies } from "../_data";
import { getAccount } from "../_lib/account";

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

  // Shalom u Olva: la agencia elegida de la lista manda (nombre y distrito oficiales). Otros envíos no llevan id de agencia.
  let input = { ...parsed.data, agencyId: undefined as string | undefined };
  const courier = methodCourier({ kind: "agency", slug: parsed.data.shippingMethod, name: "" });
  if (courier) {
    const resolved = resolveAgency(await getCourierAgencies(courier), parsed.data.agencyId);
    if ("error" in resolved) return { ok: false, errors: { agencyName: resolved.error } };
    if (resolved.agency) input = { ...input, agencyId: resolved.agency.id, agencyName: agencyLabel(resolved.agency), ubigeo: resolved.agency.ubigeo };
  }

  const result = await placeOrder(db, input);
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

  // Con la cuenta abierta: el cliente queda enlazado y, si lo pidió, se guarda la dirección para la próxima.
  const account = await getAccount();
  if (account) {
    const kind = result.shippingKind === "lima_delivery" ? "delivery" : result.shippingKind === "agency" ? "agency" : null;
    after(async () => {
      try {
        await linkCustomerToAccount(db, account, input.email);
        if (input.saveAddress && kind && input.ubigeo) {
          await rememberCheckoutAddress(db, account.id, {
            kind,
            ubigeo: input.ubigeo,
            address: input.address,
            reference: input.addressReference,
            agencyName: input.agencyName,
            agencyId: input.agencyId,
            agencyCourier: input.agencyId ? courier : null,
          });
        }
      } catch (error) {
        console.error("[cuenta] No se pudo guardar la dirección", error instanceof Error ? error.message : error);
      }
    });
  }
  return { ok: true, orderId: result.orderId, payNow: parsed.data.paymentMethod === "tarjeta" };
}
