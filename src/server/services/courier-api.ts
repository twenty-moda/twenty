/** Shalom u Olva con la misma forma: agencias de destino y seguimiento de la guía. `null` = sin llave configurada. */
import type { Courier, CourierAgency, CourierTracking } from "@/lib/couriers";
import type { DistrictRow } from "./couriers";
import * as mathyu from "./mathyu-api";
import * as olva from "./olva";
import * as shalom from "./shalom";

export type CourierApi = {
  agencies(districts: DistrictRow[]): Promise<CourierAgency[]>;
  track(guideNumber: string, guideCode: string): Promise<CourierTracking | null>;
};

export function courierFromEnv(courier: Courier): CourierApi | null {
  // La API de Mathyu's Solutions, si está configurada, para los dos couriers; si no, las de terceros.
  const own = mathyu.mathyuFromEnv();
  if (own) return { agencies: async (districts) => mathyu.toAgencies(courier, await own.listAgencies(courier), districts), track: (n, c) => own.track(courier, n, c) };
  if (courier === "shalom") {
    const client = shalom.shalomFromEnv();
    return client && { agencies: async (districts) => shalom.toAgencies(await client.listAgencies(), districts), track: (n, c) => client.track(n, c) };
  }
  const client = olva.olvaFromEnv();
  return client && { agencies: async (districts) => olva.toAgencies(await client.listAgencies(), districts), track: (n, c) => client.track(n, c) };
}
