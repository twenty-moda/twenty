import { and, count, desc, eq, inArray, notInArray, or, sql, sum } from "drizzle-orm";
import { z } from "zod";
import { COUPON_ERRORS, COUPON_TYPES, couponDiscount, isValidCouponCode, minimumError, normalizeCouponCode, type CouponRule } from "@/lib/coupons";
import { PAID_STATUSES, RESTOCK_STATUSES } from "@/lib/order-status";
import type { Db } from "../db/client";
import { coupons, orders } from "../db/schema";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type CouponRow = typeof coupons.$inferSelect;
/** Quien compra: los usos por cliente y la primera compra se miran por email o por documento. */
export type CouponCustomer = { email: string; documentNumber: string };

export const couponRule = (c: CouponRow): CouponRule => ({
  code: c.code,
  type: c.type,
  value: c.value,
  maxDiscountCents: c.maxDiscountCents,
  minSubtotalCents: c.minSubtotalCents,
});

/** Pedidos que gastan un uso: todos menos los anulados y rechazados (al anular, el uso vuelve). */
const usedBy = (couponId: string) => and(eq(orders.couponId, couponId), notInArray(orders.status, RESTOCK_STATUSES));
const sameCustomer = (customer: CouponCustomer) =>
  or(sql`lower(${orders.email}) = ${customer.email.trim().toLowerCase()}`, eq(orders.documentNumber, customer.documentNumber.trim().toUpperCase()));

/** Lo que no depende de los usos: activo, fechas y compra mínima. */
function ruleError(c: CouponRow, productsTotalCents: number, now: Date): string | null {
  if (!c.isActive) return COUPON_ERRORS.inactive;
  if (c.startsAt && c.startsAt > now) return COUPON_ERRORS.notStarted;
  if (c.endsAt && c.endsAt <= now) return COUPON_ERRORS.expired;
  if (couponDiscount(couponRule(c), productsTotalCents) === 0) return minimumError(c.minSubtotalCents);
  return null;
}

async function usageError(db: Db | Tx, c: CouponRow, customer: CouponCustomer | null): Promise<string | null> {
  if (c.usageLimit !== null) {
    const [{ uses }] = await db.select({ uses: count() }).from(orders).where(usedBy(c.id));
    if (uses >= c.usageLimit) return COUPON_ERRORS.exhausted;
  }
  if (!customer) return null;
  if (c.perCustomerLimit !== null) {
    const [{ uses }] = await db.select({ uses: count() }).from(orders).where(and(usedBy(c.id), sameCustomer(customer)));
    if (uses >= c.perCustomerLimit) return COUPON_ERRORS.perCustomer;
  }
  if (c.firstPurchaseOnly) {
    const [previous] = await db
      .select({ id: orders.id })
      .from(orders)
      .where(and(inArray(orders.status, PAID_STATUSES), sameCustomer(customer)))
      .limit(1);
    if (previous) return COUPON_ERRORS.firstPurchase;
  }
  return null;
}

export type CouponCheck = { ok: true; id: string; coupon: CouponRule; discountCents: number } | { ok: false; message: string };

async function evaluate(db: Db | Tx, c: CouponRow | undefined, productsTotalCents: number, customer: CouponCustomer | null, now: Date): Promise<CouponCheck> {
  if (!c) return { ok: false, message: COUPON_ERRORS.notFound };
  const error = ruleError(c, productsTotalCents, now) ?? (await usageError(db, c, customer));
  if (error) return { ok: false, message: error };
  return { ok: true, id: c.id, coupon: couponRule(c), discountCents: couponDiscount(couponRule(c), productsTotalCents) };
}

/** Para el checkout: si el cupón vale con este carrito (y este cliente, si ya escribió sus datos). No gasta un uso. */
export async function checkCoupon(db: Db, code: string, productsTotalCents: number, customer: CouponCustomer | null, now = new Date()) {
  const [c] = await db.select().from(coupons).where(eq(coupons.code, normalizeCouponCode(code))).limit(1);
  return evaluate(db, c, productsTotalCents, customer, now);
}

/**
 * Dentro de la transacción del pedido: bloquea el cupón y vuelve a revisar todo. Dos compras a la vez con el último uso
 * se turnan en el bloqueo y la segunda ya cuenta el pedido de la primera.
 */
export async function claimCoupon(tx: Tx, code: string, productsTotalCents: number, customer: CouponCustomer, now = new Date()) {
  const [c] = await tx.select().from(coupons).where(eq(coupons.code, normalizeCouponCode(code))).for("update").limit(1);
  return evaluate(tx, c, productsTotalCents, customer, now);
}

// ─── Panel ───────────────────────────────────────────────────────────────────

export type CouponState = "apagado" | "termino" | "programado" | "agotado" | "activo";

const couponState = (c: Pick<CouponRow, "isActive" | "startsAt" | "endsAt" | "usageLimit">, uses: number, now: Date): CouponState =>
  !c.isActive
    ? "apagado"
    : c.endsAt && c.endsAt <= now
      ? "termino"
      : c.usageLimit !== null && uses >= c.usageLimit
        ? "agotado"
        : c.startsAt && c.startsAt > now
          ? "programado"
          : "activo";

/** Usos de cada cupón en la lista. Con la tabla escrita: sin ella, "id" sería el de orders (ver ORDERS_ID en orders.ts). */
const usesInList = sql<number>`(select count(*)::int from ${orders} where ${orders.couponId} = ${sql.raw(`"coupons"."id"`)} and ${orders.status} not in ('anulado', 'rechazado'))`;

export async function listCouponsAdmin(db: Db, now = new Date()) {
  const rows = await db
    .select({
      id: coupons.id,
      code: coupons.code,
      description: coupons.description,
      type: coupons.type,
      value: coupons.value,
      minSubtotalCents: coupons.minSubtotalCents,
      usageLimit: coupons.usageLimit,
      isActive: coupons.isActive,
      startsAt: coupons.startsAt,
      endsAt: coupons.endsAt,
      uses: usesInList,
    })
    .from(coupons)
    .orderBy(desc(coupons.isActive), desc(coupons.createdAt));
  return rows.map((c) => ({ ...c, state: couponState(c, c.uses, now) }));
}

export async function getCouponAdmin(db: Db, id: string, now = new Date()) {
  const [c] = await db.select().from(coupons).where(eq(coupons.id, id)).limit(1);
  if (!c) return null;
  const [recent, [totals]] = await Promise.all([
    db
      .select({
        number: orders.number,
        status: orders.status,
        customerName: orders.customerName,
        totalCents: orders.totalCents,
        couponDiscountCents: orders.couponDiscountCents,
        createdAt: orders.createdAt,
      })
      .from(orders)
      .where(eq(orders.couponId, id))
      .orderBy(desc(orders.createdAt))
      .limit(20),
    db
      .select({ uses: count(), discountCents: sum(orders.couponDiscountCents).mapWith(Number) })
      .from(orders)
      .where(usedBy(id)),
  ]);
  return { ...c, uses: totals.uses, discountCents: totals.discountCents ?? 0, state: couponState(c, totals.uses, now), recentOrders: recent };
}

const optionalLimit = z.number().int("Escribe un número entero").min(1, "Mínimo 1").max(100_000).nullable();

export const couponInputSchema = z
  .object({
    code: z
      .string()
      .transform(normalizeCouponCode)
      .refine(isValidCouponCode, "De 3 a 30 letras o números, sin espacios (puede llevar - o _)"),
    description: z.string().trim().max(300).nullable().optional(),
    type: z.enum(COUPON_TYPES),
    value: z.number({ error: "Escribe el descuento" }).int().positive("Escribe el descuento"),
    maxDiscountCents: z.number().int().positive("Escribe el tope o déjalo vacío").nullable(),
    minSubtotalCents: z.number().int().min(0).nullable(),
    usageLimit: optionalLimit,
    perCustomerLimit: optionalLimit,
    firstPurchaseOnly: z.boolean(),
    isActive: z.boolean(),
    startsAt: z.date().nullable(),
    endsAt: z.date().nullable(),
  })
  .refine((c) => c.type !== "porcentaje" || c.value <= 100, { path: ["value"], message: "El porcentaje va de 1 a 100" })
  .refine((c) => !c.startsAt || !c.endsAt || c.endsAt > c.startsAt, { path: ["endsAt"], message: "El fin debe ser después del inicio" });
export type CouponInput = z.infer<typeof couponInputSchema>;

export async function saveCoupon(db: Db, id: string | null, input: CouponInput): Promise<{ ok: true; id: string } | { ok: false; field: "code"; message: string }> {
  const [taken] = await db.select({ id: coupons.id }).from(coupons).where(eq(coupons.code, input.code)).limit(1);
  if (taken && taken.id !== id) return { ok: false, field: "code", message: "Ya hay un cupón con ese código" };
  const values = {
    code: input.code,
    description: input.description || null,
    type: input.type,
    value: input.value,
    maxDiscountCents: input.type === "porcentaje" ? input.maxDiscountCents : null,
    minSubtotalCents: input.minSubtotalCents ?? 0,
    usageLimit: input.usageLimit,
    perCustomerLimit: input.perCustomerLimit,
    firstPurchaseOnly: input.firstPurchaseOnly,
    isActive: input.isActive,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
  };
  if (id) {
    await db.update(coupons).set(values).where(eq(coupons.id, id));
    return { ok: true, id };
  }
  const [row] = await db.insert(coupons).values(values).returning({ id: coupons.id });
  return { ok: true, id: row.id };
}

/** Los pedidos que lo usaron conservan el código y el descuento. */
export async function deleteCoupon(db: Db, id: string) {
  await db.delete(coupons).where(eq(coupons.id, id));
}
