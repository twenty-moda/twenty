import { and, asc, eq, ilike, isNotNull, or } from "drizzle-orm";
import type { DistrictInfo, ShippingMethodInfo } from "@/lib/shipping";
import type { Db } from "../db/client";
import { districts, shippingMethods } from "../db/schema";

export async function listShippingMethods(db: Db, { includeInactive = false } = {}) {
  const rows = await db
    .select()
    .from(shippingMethods)
    .where(includeInactive ? undefined : eq(shippingMethods.isActive, true))
    .orderBy(asc(shippingMethods.position));
  return rows;
}

export function toShippingInfo(m: typeof shippingMethods.$inferSelect): ShippingMethodInfo {
  return {
    id: m.id,
    slug: m.slug,
    name: m.name,
    description: m.description,
    details: m.details,
    kind: m.kind,
    paymentOnDelivery: m.paymentOnDelivery,
  };
}

export async function getDistrict(db: Db, ubigeo: string): Promise<DistrictInfo | null> {
  const [row] = await db.select().from(districts).where(eq(districts.ubigeo, ubigeo)).limit(1);
  return row ?? null;
}

/** Lista compacta para el buscador del checkout: [ubigeo, distrito, provincia, departamento]. Lima primero. */
export async function listDistrictsCompact(db: Db): Promise<[string, string, string, string][]> {
  const rows = await db.select().from(districts).orderBy(asc(districts.department), asc(districts.province), asc(districts.name));
  const lima = rows.filter((r) => r.deliveryPriceCents !== null);
  const rest = rows.filter((r) => r.deliveryPriceCents === null);
  return [...lima, ...rest].map((r) => [r.ubigeo, r.name, r.province, r.department]);
}

// ─── Admin ───────────────────────────────────────────────────────────────────

export async function listDeliveryDistricts(db: Db) {
  return db.select().from(districts).where(isNotNull(districts.deliveryPriceCents)).orderBy(asc(districts.name));
}

export async function searchDistricts(db: Db, query: string) {
  const q = `%${query.trim()}%`;
  return db
    .select()
    .from(districts)
    .where(or(ilike(districts.name, q), ilike(districts.province, q), ilike(districts.department, q)))
    .orderBy(asc(districts.department), asc(districts.name))
    .limit(30);
}

export async function setDistrictDeliveryPrice(db: Db, ubigeo: string, priceCents: number | null) {
  await db.update(districts).set({ deliveryPriceCents: priceCents }).where(eq(districts.ubigeo, ubigeo));
}

export async function updateShippingMethod(
  db: Db,
  id: string,
  data: { name: string; description: string | null; details: string[]; isActive: boolean },
) {
  await db.update(shippingMethods).set(data).where(and(eq(shippingMethods.id, id)));
}
