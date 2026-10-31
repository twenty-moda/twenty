import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { CheckoutInput } from "@/lib/checkout-schema";
import { COUPON_ERRORS, minimumError } from "@/lib/coupons";
import type { Db } from "../db/client";

// El cliente de BD lee DATABASE_URL: se apunta a la BD de tests antes de importarlo.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
const { getDb, closeDb } = await import("../db/client");
const schema = await import("../db/schema");
const { placeOrder, changeOrderStatus, getOrderById } = await import("./orders");
const { checkCoupon, getCouponAdmin, listCouponsAdmin, saveCoupon } = await import("./coupons");

let db: Db;
const ids = {
  category: randomUUID(),
  product: randomUUID(),
  color: randomUUID(),
  size30: randomUUID(),
  size32: randomUUID(),
  jean: randomUUID(),
  jean32: randomUUID(),
  promo: randomUUID(),
};

function checkout(overrides: Partial<CheckoutInput> = {}, n = 0): CheckoutInput {
  return {
    name: "Cliente de prueba",
    phone: "999000000",
    email: `cupon${n}@example.com`,
    documentType: "dni",
    documentNumber: String(10000000 + n),
    invoiceType: "boleta",
    shippingMethod: "delivery-lima",
    ubigeo: "140130",
    address: "Av. Siempre Viva 123",
    paymentMethod: "yape_plin",
    items: [{ variantId: ids.jean, quantity: 1 }],
    couponCode: "TWENTY10",
    ...overrides,
  } as CheckoutInput;
}

async function createCoupon(values: Partial<typeof schema.coupons.$inferInsert> = {}) {
  const [row] = await db
    .insert(schema.coupons)
    .values({ code: "TWENTY10", type: "porcentaje", value: 10, ...values })
    .returning();
  return row;
}

async function jeanStock() {
  const [v] = await db.select({ stock: schema.productVariants.stock }).from(schema.productVariants).where(eq(schema.productVariants.id, ids.jean));
  return v.stock;
}

beforeAll(async () => {
  db = getDb();
  await db.execute(sql`TRUNCATE order_status_history, order_items, orders, customers, coupons, promotion_products, promotions,
    product_images, product_redirects, product_variants, products, category_fits, categories, fits, colors, sizes,
    districts, shipping_methods CASCADE`);
  await db.insert(schema.categories).values({ id: ids.category, slug: "pantalones", name: "Pantalones" });
  await db.insert(schema.colors).values({ id: ids.color, slug: "negro", name: "Negro" });
  await db.insert(schema.sizes).values([
    { id: ids.size30, label: "30" },
    { id: ids.size32, label: "32" },
  ]);
  await db.insert(schema.products).values({ id: ids.product, slug: "mom-jean", name: "Mom Jean", categoryId: ids.category, status: "active" });
  await db.insert(schema.productVariants).values([
    { id: ids.jean, productId: ids.product, sku: "TMW-CUP-30", colorId: ids.color, sizeId: ids.size30, priceCents: 7000, stock: 100 },
    { id: ids.jean32, productId: ids.product, sku: "TMW-CUP-32", colorId: ids.color, sizeId: ids.size32, priceCents: 4990, stock: 100 },
  ]);
  await db.insert(schema.shippingMethods).values({ id: randomUUID(), slug: "delivery-lima", name: "Delivery Lima", kind: "lima_delivery" });
  await db.insert(schema.districts).values({ ubigeo: "140130", name: "Santiago De Surco", province: "Lima", department: "Lima", deliveryPriceCents: 1200 });
});

beforeEach(async () => {
  await db.execute(sql`TRUNCATE order_status_history, order_items, orders, customers, coupons, promotion_products, promotions CASCADE`);
  await db.update(schema.productVariants).set({ stock: 100 });
});

afterAll(async () => {
  await closeDb();
});

describe("placeOrder con cupón", () => {
  it("porcentaje: guarda el cupón, descuenta de las prendas (no del envío) y lo reparte entre las líneas", async () => {
    const coupon = await createCoupon({ value: 15 });
    const result = await placeOrder(
      db,
      checkout({
        couponCode: "twenty10", // en minúsculas también vale
        items: [
          { variantId: ids.jean, quantity: 2 },
          { variantId: ids.jean32, quantity: 1 },
        ],
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const order = (await getOrderById(db, result.orderId))!;
    // Prendas: 2 × 70 + 49.90 = 189.90; 15% = 28.485 → 28.49. Envío 12.
    expect(order.subtotalCents).toBe(18990);
    expect(order.couponId).toBe(coupon.id);
    expect(order.couponCode).toBe("TWENTY10");
    expect(order.couponDiscountCents).toBe(2849);
    expect(order.totalCents).toBe(18990 - 2849 + 1200);
    expect(result.totalCents).toBe(order.totalCents);
    expect(order.items.reduce((s, i) => s + i.couponDiscountCents, 0)).toBe(2849);
    // La línea se sigue mostrando sin el cupón.
    expect(order.items.find((i) => i.variantId === ids.jean)!.totalCents).toBe(14000);
  });

  it("monto fijo después de la promo “N x S/”", async () => {
    await db.insert(schema.promotions).values({ id: ids.promo, name: "2 X 100", type: "bundle_price", quantity: 2, bundlePriceCents: 10000 });
    await db.insert(schema.promotionProducts).values({ promotionId: ids.promo, productId: ids.product });
    await createCoupon({ type: "monto", value: 2000 });
    const result = await placeOrder(db, checkout({ items: [{ variantId: ids.jean, quantity: 2 }] }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const order = (await getOrderById(db, result.orderId))!;
    expect(order.discountCents).toBe(4000); // promo: 140 → 100
    expect(order.couponDiscountCents).toBe(2000);
    expect(order.totalCents).toBe(10000 - 2000 + 1200);
  });

  it("si el cupón no vale, no se crea el pedido ni se toca el stock", async () => {
    const cases: [Partial<typeof schema.coupons.$inferInsert>, string][] = [
      [{ isActive: false }, COUPON_ERRORS.inactive],
      [{ endsAt: new Date(Date.now() - 60_000) }, COUPON_ERRORS.expired],
      [{ startsAt: new Date(Date.now() + 60 * 60_000) }, COUPON_ERRORS.notStarted],
      [{ minSubtotalCents: 10000 }, minimumError(10000)],
    ];
    for (const [values, message] of cases) {
      await db.delete(schema.coupons);
      await createCoupon(values);
      expect(await placeOrder(db, checkout())).toEqual({ ok: false, code: "coupon", message });
    }
    expect(await placeOrder(db, checkout({ couponCode: "NOEXISTE" }))).toEqual({ ok: false, code: "coupon", message: COUPON_ERRORS.notFound });
    expect(await db.select().from(schema.orders)).toHaveLength(0);
    expect(await jeanStock()).toBe(100);
  });

  it("5 compras a la vez con el último uso: solo 1 lo consigue", async () => {
    await createCoupon({ usageLimit: 1 });
    const results = await Promise.all(Array.from({ length: 5 }, (_, i) => placeOrder(db, checkout({}, i))));
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok && r.code === "coupon" && r.message === COUPON_ERRORS.exhausted)).toHaveLength(4);
    expect(await jeanStock()).toBe(99);
  });

  it("al anular el pedido, el uso vuelve al cupón", async () => {
    await createCoupon({ usageLimit: 1 });
    const first = await placeOrder(db, checkout({}, 1));
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(await placeOrder(db, checkout({}, 2))).toMatchObject({ ok: false, code: "coupon" });
    await changeOrderStatus(db, { orderId: first.orderId, to: "anulado", userId: null });
    expect((await placeOrder(db, checkout({}, 2))).ok).toBe(true);
  });

  it("usos por cliente: por email o por documento", async () => {
    await createCoupon({ perCustomerLimit: 1 });
    expect((await placeOrder(db, checkout({}, 1))).ok).toBe(true);
    // Mismo email (con mayúsculas), otro documento.
    expect(await placeOrder(db, checkout({ email: "CUPON1@example.com", documentNumber: "77777777" }, 2))).toMatchObject({
      ok: false,
      message: COUPON_ERRORS.perCustomer,
    });
    // Otro email, mismo documento.
    expect(await placeOrder(db, checkout({ email: "otro@example.com", documentNumber: "10000001" }, 2))).toMatchObject({
      ok: false,
      message: COUPON_ERRORS.perCustomer,
    });
    expect((await placeOrder(db, checkout({}, 3))).ok).toBe(true);
  });

  it("solo primera compra: no vale si el cliente ya tiene un pedido pagado", async () => {
    await createCoupon({ firstPurchaseOnly: true });
    const previous = await placeOrder(db, checkout({ couponCode: undefined }, 1));
    expect(previous.ok).toBe(true);
    if (!previous.ok) return;
    // Un pedido sin pagar no cuenta.
    expect((await checkCoupon(db, "TWENTY10", 7000, { email: "cupon1@example.com", documentNumber: "10000001" })).ok).toBe(true);
    await changeOrderStatus(db, { orderId: previous.orderId, to: "pagado", userId: null });
    expect(await checkCoupon(db, "TWENTY10", 7000, { email: "cupon1@example.com", documentNumber: "10000001" })).toEqual({
      ok: false,
      message: COUPON_ERRORS.firstPurchase,
    });
    expect(await placeOrder(db, checkout({}, 1))).toMatchObject({ ok: false, message: COUPON_ERRORS.firstPurchase });
    expect((await placeOrder(db, checkout({}, 2))).ok).toBe(true);
  });
});

describe("panel de cupones", () => {
  it("cuenta los usos vigentes y el descuento dado", async () => {
    const coupon = await createCoupon({ usageLimit: 3 });
    const a = await placeOrder(db, checkout({}, 1));
    const b = await placeOrder(db, checkout({}, 2));
    if (!a.ok || !b.ok) throw new Error("no se creó el pedido");
    await changeOrderStatus(db, { orderId: b.orderId, to: "anulado", userId: null });

    const [listed] = await listCouponsAdmin(db);
    expect(listed).toMatchObject({ code: "TWENTY10", uses: 1, state: "activo" });
    const detail = (await getCouponAdmin(db, coupon.id))!;
    expect(detail.uses).toBe(1);
    expect(detail.discountCents).toBe(700);
    expect(detail.recentOrders).toHaveLength(2);
  });

  it("no deja repetir un código", async () => {
    const coupon = await createCoupon();
    const input = {
      code: "TWENTY10",
      type: "monto" as const,
      value: 1000,
      maxDiscountCents: null,
      minSubtotalCents: null,
      usageLimit: null,
      perCustomerLimit: null,
      firstPurchaseOnly: false,
      isActive: true,
      startsAt: null,
      endsAt: null,
    };
    expect(await saveCoupon(db, null, input)).toMatchObject({ ok: false, field: "code" });
    // Guardarse a sí mismo con el mismo código sí vale.
    expect(await saveCoupon(db, coupon.id, input)).toEqual({ ok: true, id: coupon.id });
  });
});
