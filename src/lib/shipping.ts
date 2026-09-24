/** Qué formas de entrega ve el cliente según su distrito, y cuánto cuestan. */

export type ShippingKind = "lima_delivery" | "agency" | "store_pickup";

export type ShippingMethodInfo = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  details: string[];
  kind: ShippingKind;
  paymentOnDelivery: boolean;
};

export type DistrictInfo = {
  ubigeo: string;
  name: string;
  province: string;
  department: string;
  deliveryPriceCents: number | null;
};

export type ShippingOption = ShippingMethodInfo & { priceCents: number; needsAddress: boolean };

/**
 * - Delivery Lima: solo en distritos con precio de motorizado.
 * - Agencias: a todo el Perú; el flete se paga en destino (S/ 0 en la web).
 * - Recojo en tienda: siempre disponible y gratis; no pide dirección.
 */
export function shippingOptions(methods: ShippingMethodInfo[], district: DistrictInfo | null): ShippingOption[] {
  return methods.flatMap((m): ShippingOption[] => {
    if (m.kind === "store_pickup") return [{ ...m, priceCents: 0, needsAddress: false }];
    if (!district) return [];
    if (m.kind === "lima_delivery") {
      return district.deliveryPriceCents === null ? [] : [{ ...m, priceCents: district.deliveryPriceCents, needsAddress: true }];
    }
    return [{ ...m, priceCents: 0, needsAddress: true }];
  });
}

/** "Santiago De Surco, Lima - Lima" → partes del nombre que venía en delivery_prices. */
export function parseDistrictName(value: string): { name: string; province: string; department: string } | null {
  const match = value.match(/^(.+?),\s*(.+?)\s+-\s+(.+)$/);
  if (!match) return null;
  return { name: match[1].trim(), province: match[2].trim(), department: match[3].trim() };
}
