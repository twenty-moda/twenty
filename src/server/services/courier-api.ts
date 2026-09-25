/** Shalom u Olva con la misma forma: agencias de destino y seguimiento de la guía. `null` = sin llave configurada. */
import type { Courier, CourierAgency, CourierTracking } from "@/lib/couriers";
import type { DistrictRow } from "./couriers";
import * as olva from "./olva";
import * as shalom from "./shalom";

export type CourierApi = {
  agencies(districts: DistrictRow[]): Promise<CourierAgency[]>;
  track(guideNumber: string, guideCode: string): Promise<CourierTracking | null>;
};

export function courierFromEnv(courier: Courier): CourierApi | null {
  if (courier === "shalom") {
    const client = shalom.shalomFromEnv();
    return client && { agencies: async (districts) => shalom.toAgencies(await client.listAgencies(), districts), track: (n, c) => client.track(n, c) };
  }
  const client = olva.olvaFromEnv();
  return client && { agencies: async (districts) => olva.toAgencies(await client.listAgencies(), districts), track: (n, c) => client.track(n, c) };
}
