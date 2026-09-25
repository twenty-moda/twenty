import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "../db/client";
import type { CulqiClient, CulqiResponse } from "./payments";

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
const { getDb, closeDb } = await import("../db/client");
const schema = await import("../db/schema");
const { placeOrder, getOrderByNumber, getOrderForCustomer, changeOrderStatus } = await import("./orders");
const { payOrderWithCulqi } = await import("./payments");
const { refundOrder, resolvePendingRefund } = await import("./refunds");
const { notifyOrderEvent } = await import("./order-notifications");

let db: Db;
const variantId = randomUUID();

/** Culqi falso: cobra siempre y devuelve lo que diga `refund` (por defecto, una devolución hecha con id nuevo). */
function fakeCulqi(refund?: (body: Record<string, unknown>) => Promise<CulqiResponse>) {
  const refunds: Record<string, unknown>[] = [];
  let n = 0;
  const client: CulqiClient = {
    async createCharge() {
      return { status: 201, body: { object: "charge", id: `chr_${randomUUID()}` } };
    },
    async getCharge() {
      return { status: 404, body: {} };
    },
    async createRefund(body) {
      refunds.push(body);
      return refund ? refund(body) : { status: 201, body: { object: "refund", id: `ref_test_${++n}`, amount: body.amount } };
    },
  };
  return { client, refunds };
}

async function stock() {
  const [row] = await db.select({ stock: schema.productVariants.stock }).from(schema.productVariants).where(eq(schema.productVariants.id, variantId));
  return row.stock;
}

async function newOrder(paymentMethod: "tarjeta" | "yape_plin", quantity = 2) {
  const result = await placeOrder(db, {
    name: "Cliente Devolución",
    phone: "999000000",
    email: "devolucion@example.com",
    documentType: "dni",
    documentNumber: "00000000",
    invoiceType: "boleta",
    shippingMethod: "recojo-en-tienda",
    paymentMethod,
    items: [{ variantId, quantity }],
  } as never);
  if (!result.ok) throw new Error("no se creó el pedido");
  return result;
}

/** Pedido de 2 polos (S/ 80) pagado con tarjeta por Culqi. */
async function paidOrder(client: CulqiClient) {
  const order = await newOrder("tarjeta");
  const paid = await payOrderWithCulqi(db, client, { orderId: order.orderId, tokenId: "tkn_test", email: "devolucion@example.com" });
  if (paid.status !== "paid") throw new Error("no se pagó");
  const detail = await getOrderByNumber(db, order.number);
  return { ...order, itemId: detail!.items[0].id };
}

const base = { method: "culqi" as const, userId: null };

beforeAll(async () => {
  db = getDb();
  await db.execute(sql`TRUNCATE payments, order_status_history, order_items, orders, customers, promotion_products, promotions,
    product_images, product_redirects, product_variants, products, category_fits, categories, fits, colors, sizes,
    districts, shipping_methods CASCADE`);
  const [category] = await db.insert(schema.categories).values({ slug: "polos", name: "Polos" }).returning();
  const [color] = await db.insert(schema.colors).values({ slug: "negro", name: "Negro" }).returning();
  const [size] = await db.insert(schema.sizes).values({ label: "M" }).returning();
  const [product] = await db.insert(schema.products).values({ slug: "polo", name: "Polo", categoryId: category.id, status: "active" }).returning();
  await db.insert(schema.productVariants).values({ id: variantId, productId: product.id, sku: "TMW-REF", colorId: color.id, sizeId: size.id, priceCents: 4000, stock: 100 });
  await db.insert(schema.shippingMethods).values({ slug: "recojo-en-tienda", name: "Recojo en tienda", kind: "store_pickup" });
});

beforeEach(async () => {
  await db.execute(sql`TRUNCATE refunds, refund_items, payments, order_status_history, order_items, orders, customers CASCADE`);
  await db.update(schema.productVariants).set({ stock: 100 }).where(eq(schema.productVariants.id, variantId));
});

afterAll(async () => {
  await closeDb();
});

describe("refundOrder con Culqi", () => {
  it("devuelve una parte sin anular el pedido y luego el resto, sin pasar de lo pagado", async () => {
    const { client, refunds } = fakeCulqi();
    const order = await paidOrder(client);

    const first = await refundOrder(db, client, { ...base, orderId: order.orderId, amount: 3000, reason: "cortesia", customerMessage: "Por la demora." });
    expect(first).toMatchObject({ ok: true, amountCents: 3000, method: "culqi" });
    expect(refunds[0]).toMatchObject({ amount: 3000, reason: "solicitud_comprador", metadata: { order_id: order.orderId } });
    expect(String(refunds[0].charge_id)).toMatch(/^chr_/);
    const saved = await getOrderByNumber(db, order.number);
    expect(saved?.status).toBe("pagado");
    expect(saved?.refunds).toMatchObject([{ status: "hecha", providerId: "ref_test_1", amountCents: 3000, reason: "cortesia", customerMessage: "Por la demora." }]);

    expect(await refundOrder(db, client, { ...base, orderId: order.orderId, amount: 6000, reason: "cortesia" })).toEqual({
      ok: false,
      message: "Lo máximo que puedes devolver es S/ 50.",
    });
    expect(await refundOrder(db, client, { ...base, orderId: order.orderId, amount: "all", reason: "cliente" })).toMatchObject({ ok: true, amountCents: 5000 });
    expect(await refundOrder(db, client, { ...base, orderId: order.orderId, amount: "all", reason: "cliente" })).toMatchObject({
      ok: false,
      message: "Ya se devolvió todo lo que pagó el cliente.",
    });
    expect(refunds).toHaveLength(2);
  });

  it("dos devoluciones a la vez (doble toque, dos admins) no devuelven de más", async () => {
    const { client, refunds } = fakeCulqi();
    const order = await paidOrder(client);
    const results = await Promise.all(Array.from({ length: 5 }, () => refundOrder(db, client, { ...base, orderId: order.orderId, amount: "all", reason: "cliente" })));
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(refunds).toHaveLength(1);
    const [{ total }] = await db
      .select({ total: sql<number>`sum(${schema.refunds.amountCents})::int` })
      .from(schema.refunds)
      .where(eq(schema.refunds.orderId, order.orderId));
    expect(total).toBe(8000);
  });

  it("si Culqi la rechaza no queda registrada; si no responde queda pendiente hasta que el equipo la confirme", async () => {
    const rejected = fakeCulqi(async () => ({ status: 400, body: { object: "error", merchant_message: "El plazo para devolver este cargo venció." } }));
    const order = await paidOrder(rejected.client);
    expect(await refundOrder(db, rejected.client, { ...base, orderId: order.orderId, amount: "all", reason: "cliente" })).toEqual({
      ok: false,
      message: "Culqi no hizo la devolución: El plazo para devolver este cargo venció.",
    });
    expect((await getOrderByNumber(db, order.number))?.refunds).toEqual([]);

    const silent = fakeCulqi(async () => {
      throw new Error("timeout");
    });
    const pending = await refundOrder(db, silent.client, { ...base, orderId: order.orderId, amount: "all", reason: "cliente" });
    expect(pending).toMatchObject({ ok: false, pending: true });
    const [row] = (await getOrderByNumber(db, order.number))!.refunds;
    expect(row).toMatchObject({ status: "pendiente", amountCents: 8000 });
    // Mientras está pendiente cuenta como devuelta: no se puede volver a devolver.
    expect(await refundOrder(db, rejected.client, { ...base, orderId: order.orderId, amount: "all", reason: "cliente" })).toMatchObject({ ok: false });
    // El cliente no la ve hasta que se confirme.
    expect((await getOrderForCustomer(db, order.orderId))?.refunds).toEqual([]);

    expect(await resolvePendingRefund(db, { orderId: order.orderId, refundId: row.id, done: false })).toBe(true);
    expect(await resolvePendingRefund(db, { orderId: order.orderId, refundId: row.id, done: false })).toBe(false);
    expect((await getOrderByNumber(db, order.number))?.refunds).toEqual([]);

    await refundOrder(db, silent.client, { ...base, orderId: order.orderId, amount: 1000, reason: "cliente" });
    const [again] = (await getOrderByNumber(db, order.number))!.refunds;
    expect(await resolvePendingRefund(db, { orderId: randomUUID(), refundId: again.id, done: true })).toBe(false);
    expect(await resolvePendingRefund(db, { orderId: order.orderId, refundId: again.id, done: true })).toBe(true);
    expect((await getOrderForCustomer(db, order.orderId))?.refunds).toMatchObject([{ amountCents: 1000, status: "hecha" }]);
  });
});

describe("prendas agotadas", () => {
  it("se marcan, se pueden dejar sin stock y no vuelven al stock si luego se anula el pedido", async () => {
    const { client } = fakeCulqi();
    const order = await paidOrder(client);
    expect(await stock()).toBe(98);

    expect(await refundOrder(db, client, { ...base, orderId: order.orderId, amount: 4000, reason: "agotado" })).toEqual({
      ok: false,
      message: "Marca qué prendas se agotaron.",
    });
    const soldOut = [{ orderItemId: order.itemId, quantity: 1 }];
    const result = await refundOrder(db, client, { ...base, orderId: order.orderId, amount: 4000, reason: "agotado", soldOut, clearStock: true });
    expect(result).toMatchObject({ ok: true, productSlugs: ["polo"] });
    expect(await stock()).toBe(0);
    expect((await getOrderByNumber(db, order.number))?.refunds[0].items).toEqual(soldOut);
    // La misma prenda no se puede marcar más veces de las que se compró.
    expect(await refundOrder(db, client, { ...base, orderId: order.orderId, amount: 100, reason: "agotado", soldOut: [{ orderItemId: order.itemId, quantity: 2 }] })).toMatchObject({
      ok: false,
    });

    // Al anular vuelve solo el polo que sí existe.
    const cancelled = await changeOrderStatus(db, { orderId: order.orderId, to: "anulado", userId: null });
    expect(cancelled).toMatchObject({ ok: true, restocked: true });
    expect(await stock()).toBe(1);
  });

  it("si se agotó todo, al anular no vuelve nada al stock (y no dice que volvió)", async () => {
    const { client } = fakeCulqi();
    const order = await paidOrder(client);
    await refundOrder(db, client, { ...base, orderId: order.orderId, amount: "all", reason: "agotado", soldOut: [{ orderItemId: order.itemId, quantity: 2 }] });
    const cancelled = await changeOrderStatus(db, { orderId: order.orderId, to: "anulado", userId: null });
    expect(cancelled).toMatchObject({ ok: true, restocked: false, productSlugs: [] });
    expect(await stock()).toBe(98);
  });
});

describe("devolución registrada a mano", () => {
  it("sirve para pedidos pagados por Yape/Plin con QR, y no deja devolver lo que no se pagó", async () => {
    const order = await newOrder("yape_plin");
    expect(await refundOrder(db, null, { orderId: order.orderId, amount: "all", method: "manual", reason: "cliente", userId: null })).toEqual({
      ok: false,
      message: "Este pedido no tiene pagos que devolver.",
    });
    await changeOrderStatus(db, { orderId: order.orderId, to: "pagado", userId: null });
    const { client, refunds } = fakeCulqi();
    expect(await refundOrder(db, client, { orderId: order.orderId, amount: "all", method: "culqi", reason: "cliente", userId: null })).toMatchObject({
      ok: false,
      message: "Este pedido no tiene un cobro de Culqi con saldo para devolver.",
    });
    expect(await refundOrder(db, null, { orderId: order.orderId, amount: "all", method: "manual", reason: "otro", userId: null })).toEqual({
      ok: false,
      message: "Escribe el motivo en la nota interna.",
    });
    const result = await refundOrder(db, null, { orderId: order.orderId, amount: "all", method: "manual", reason: "otro", note: "Pidió cancelar por WhatsApp", userId: null });
    expect(result).toMatchObject({ ok: true, amountCents: 8000, method: "manual" });
    expect(refunds).toHaveLength(0);
    expect((await getOrderByNumber(db, order.number))?.refunds).toMatchObject([{ status: "hecha", method: "manual", paymentId: null, note: "Pidió cancelar por WhatsApp" }]);
    // El cliente ve la devolución, pero no la nota interna.
    const [seen] = (await getOrderForCustomer(db, order.orderId))!.refunds;
    expect(seen).not.toHaveProperty("note");
  });
});

describe("emails de la devolución", () => {
  it("le llegan al cliente y al equipo, sin el admin que la hizo", async () => {
    const { client } = fakeCulqi();
    const order = await paidOrder(client);
    const [actor, other] = await db
      .insert(schema.users)
      .values([
        { name: "Quien devuelve", email: `actor-${randomUUID()}@example.com`, role: "admin" },
        { name: "Otra admin", email: `otra-${randomUUID()}@example.com`, role: "admin" },
      ])
      .returning();
    const result = await refundOrder(db, client, { ...base, orderId: order.orderId, amount: 4000, reason: "agotado", soldOut: [{ orderItemId: order.itemId, quantity: 1 }], userId: actor.id });
    if (!result.ok) throw new Error(result.message);

    const sent: { to: string | string[]; subject: string; text: string }[] = [];
    const realFetch = globalThis.fetch;
    const env = { key: process.env.RESEND_API_KEY, from: process.env.EMAIL_FROM };
    process.env.RESEND_API_KEY = "re_test";
    process.env.EMAIL_FROM = "TWENTY <pedidos@example.com>";
    globalThis.fetch = (async (_url: string, init: RequestInit) => {
      sent.push(JSON.parse(String(init.body)));
      return new Response("{}", { status: 200 });
    }) as typeof fetch;
    try {
      await notifyOrderEvent(db, { type: "refund", orderId: order.orderId, refundId: result.refundId, userId: actor.id }, "https://tienda.example");
    } finally {
      globalThis.fetch = realFetch;
      process.env.RESEND_API_KEY = env.key;
      process.env.EMAIL_FROM = env.from;
      await db.delete(schema.users).where(eq(schema.users.id, actor.id));
      await db.delete(schema.users).where(eq(schema.users.id, other.id));
    }

    const customer = sent.find((e) => e.to === "devolucion@example.com" || (Array.isArray(e.to) && e.to.includes("devolucion@example.com")));
    expect(customer?.subject).toBe(`Te devolvimos S/ 40 · Pedido #${order.number}`);
    expect(customer?.text).toContain("Polo (Negro, talla M) se agotó");
    const team = sent.find((e) => e !== customer);
    expect(team?.subject).toContain(`Devolución de S/ 40 · Pedido #${order.number}`);
    expect(team?.to).toContain(other.email);
    expect(team?.to).not.toContain(actor.email);
  });
});
