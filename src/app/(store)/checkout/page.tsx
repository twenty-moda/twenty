import type { Metadata } from "next";
import { CheckoutFlow } from "@/components/checkout/checkout-flow";
import { culqiConfig } from "@/lib/culqi-config";
import { mapsUrl } from "@/lib/links";
import { getCheckoutShipping, getSiteSettings } from "../_data";

export const metadata: Metadata = {
  title: "Finalizar compra",
  robots: { index: false },
};

export default async function CheckoutPage() {
  const [{ methods, limaDistricts }, settings] = await Promise.all([getCheckoutShipping(), getSiteSettings()]);
  const store = settings.store
    ? { address: settings.store.address, hours: settings.contact.openingHours, mapUrl: mapsUrl(settings.store.latitude, settings.store.longitude) }
    : null;
  return <CheckoutFlow methods={methods} limaDistricts={limaDistricts} store={store} payments={{ walletEnabled: settings.payments.walletEnabled, cardEnabled: !!culqiConfig() && settings.payments.culqiEnabled }} />;
}
