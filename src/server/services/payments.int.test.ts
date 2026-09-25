import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "../db/client";
import type { CulqiClient, CulqiResponse } from "./payments";

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
const { getDb, closeDb } = await import("../db/client");
const schema = await import("../db/schema");
const { placeOrder, getOrderByNumber } = await import("./orders");
const { payOrderWithCulqi, handleCulqiEvent, interpretChargeResponse } = await import("./payments");
const { planOrderEmails, notifyOrderEvent } = await import("./order-notifications");
const { processProofImage, submitPaymentProof, listPaymentProofs, getPaymentProofImage, MAX_PROOFS_PER_ORDER } = await import("./payment-proofs");
const sharp = (await import("sharp")).default;

let db: Db;
const variantId = randomUUID();

/** Culqi falso: responde lo que el test le diga y guarda lo que recibió. */
function fakeCulqi(responses: CulqiResponse[], charges: Record<string, CulqiResponse> = {}) {
  const calls: Record<string, unknown>[] = [];
  const client: CulqiClient = {
    async createCharge(body) {
      calls.push(body);
      return responses.shift() ?? { status: 500, body: {} };
    },
    async getCharge(id) {
      return charges[id] ?? { status: 404, body: { object: "error" } };
    },
  };
  return { client, calls };
}

async function newOrder() {
  const result = await placeOrder(db, {
    name: "Cliente Prueba",
    phone: "999000000",
    email: "pago@example.com",
    documentType: "dni",
    documentNumber: "00000000",
    invoiceType: "boleta",
    shippingMethod: "recojo-en-tienda",
    paymentMethod: "yape_plin",
    items: [{ variantId, quantity: 1 }],
  } as never);
  if (!result.ok) throw new Error("no se creó el pedido");
  return result;
}

beforeAll(async () => {
  db = getDb();
  await db.execute(sql`TRUNCATE payments, order_status_history, order_items, orders, customers, promotion_products, promotions,
    product_images, product_redirects, product_variants, products, category_fits, categories, fits, colors, sizes,
    districts, shipping_methods CASCADE`);
  const [category] = await db.insert(schema.categories).values({ slug: "polos", name: "Polos" }).returning();
  const [color] = await db.insert(schema.colors).values({ slug: "negro", name: "Negro" }).returning();
  const [size] = await db.insert(schema.sizes).values({ label: "M" }).returning();
  const [product] = await db.insert(schema.products).values({ slug: "polo", name: "Polo", categoryId: category.id, status: "active" }).returning();
  await db.insert(schema.productVariants).values({ id: variantId, productId: product.id, sku: "TMW-PAY", colorId: color.id, sizeId: size.id, priceCents: 4000, stock: 100 });
  await db.insert(schema.shippingMethods).values({ slug: "recojo-en-tienda", name: "Recojo en tienda", kind: "store_pickup" });
});

beforeEach(async () => {
  await db.execute(sql`TRUNCATE payments, payment_proofs, order_status_history, order_items, orders, customers CASCADE`);
});

afterAll(async () => {
  await closeDb();
});

describe("interpretChargeResponse", () => {
  it("201 es pago, 200 + REVIEW pide 3DS, lo demás es rechazo con el mensaje de Culqi", () => {
    expect(interpretChargeResponse({ status: 201, body: { object: "charge", id: "chr_1" } })).toEqual({ kind: "paid", chargeId: "chr_1" });
    expect(interpretChargeResponse({ status: 200, body: { action_code: "REVIEW" } })).toEqual({ kind: "review" });
    expect(interpretChargeResponse({ status: 402, body: { object: "error", user_message: "Tu tarjeta no tiene fondos suficientes." } })).toMatchObject({
      kind: "declined",
      userMessage: "Tu tarjeta no tiene fondos suficientes.",
    });
  });
});

describe("payOrderWithCulqi", () => {
  it("cobra el total del pedido y lo marca como pagado", async () => {
    const order = await newOrder();
    const { client, calls } = fakeCulqi([{ status: 201, body: { object: "charge", id: "chr_test_ok" } }]);
    const result = await payOrderWithCulqi(db, client, { orderId: order.orderId, tokenId: "tkn_test_1", email: "pago@example.com", deviceId: "dev-1" });
    expect(result).toMatchObject({ status: "paid", change: { from: "pendiente", to: "pagado", changedBy: null } });
    expect(calls[0]).toMatchObject({ amount: 4000, currency_code: "PEN", source_id: "tkn_test_1", metadata: { order_id: order.orderId } });
    const saved = await getOrderByNumber(db, order.number);
    expect(saved?.status).toBe("pagado");
    expect(saved?.history.at(-1)?.note).toContain("chr_test_ok");
  });

  it("con 3DS: primero REVIEW, luego se reintenta con authentication_3DS", async () => {
    const order = await newOrder();
    const { client, calls } = fakeCulqi([
      { status: 200, body: { action_code: "REVIEW" } },
      { status: 201, body: { object: "charge", id: "chr_test_3ds" } },
    ]);
    expect(await payOrderWithCulqi(db, client, { orderId: order.orderId, tokenId: "tkn_test_2", email: "pago@example.com" })).toEqual({ status: "review" });
    const auth = { eci: "05", xid: "x", cavv: "c", protocolVersion: "2.1.0", directoryServerTransactionId: "d" };
    expect(await payOrderWithCulqi(db, client, { orderId: order.orderId, tokenId: "tkn_test_2", email: "pago@example.com", authentication3DS: auth })).toMatchObject({ status: "paid" });
    expect(calls[1]).toMatchObject({ authentication_3DS: auth });
  });

  it("si Culqi rechaza, el pedido sigue pendiente y se muestra el mensaje", async () => {
    const order = await newOrder();
    const { client } = fakeCulqi([{ status: 402, body: { object: "error", user_message: "Tarjeta rechazada." } }]);
    expect(await payOrderWithCulqi(db, client, { orderId: order.orderId, tokenId: "tkn_test_3", email: "pago@example.com" })).toEqual({
      status: "declined",
      message: "Tarjeta rechazada.",
    });
    expect((await getOrderByNumber(db, order.number))?.status).toBe("pendiente");
  });

  it("no vuelve a cobrar un pedido ya pagado", async () => {
    const order = await newOrder();
    const { client, calls } = fakeCulqi([{ status: 201, body: { object: "charge", id: "chr_once" } }]);
    await payOrderWithCulqi(db, client, { orderId: order.orderId, tokenId: "tkn_a", email: "pago@example.com" });
    // Sin `change`: el email de "pago confirmado" no se repite.
    expect(await payOrderWithCulqi(db, client, { orderId: order.orderId, tokenId: "tkn_b", email: "pago@example.com" })).toEqual({ status: "paid" });
    expect(calls).toHaveLength(1);
  });
});

describe("expireUnpaidCardOrders (cron)", () => {
  it("anula solo los pedidos con tarjeta sin pagar después de 60 minutos y devuelve el stock", async () => {
    const { expireUnpaidCardOrders } = await import("./orders");
    const card = await newOrder();
    await db.update(schema.orders).set({ paymentMethod: "tarjeta" }).where(eq(schema.orders.id, card.orderId));
    const whatsapp = await newOrder();
    const [{ stock: before }] = await db.select({ stock: schema.productVariants.stock }).from(schema.productVariants).where(eq(schema.productVariants.id, variantId));

    const in30 = new Date(Date.now() + 30 * 60 * 1000);
    expect((await expireUnpaidCardOrders(db, in30)).numbers).toEqual([]);
    const in90 = new Date(Date.now() + 90 * 60 * 1000);
    const expired = await expireUnpaidCardOrders(db, in90);
    expect(expired.numbers).toEqual([card.number]);
    // Anulación automática: el plan de emails la reconoce por changedBy null + tarjeta + pendiente.
    expect(expired.changes).toMatchObject([{ orderId: card.orderId, from: "pendiente", to: "anulado", changedBy: null, paymentMethod: "tarjeta", restocked: true }]);
    expect(planOrderEmails({ type: "status", change: expired.changes[0] })).toEqual({ customer: "expirado", team: null });

    expect((await getOrderByNumber(db, card.number))?.status).toBe("anulado");
    expect((await getOrderByNumber(db, whatsapp.number))?.status).toBe("pendiente");
    const [{ stock: after }] = await db.select({ stock: schema.productVariants.stock }).from(schema.productVariants).where(eq(schema.productVariants.id, variantId));
    expect(after).toBe(before + 1);
  });
});

describe("handleCulqiEvent (webhook)", () => {
  it("verifica el cargo en la API, marca el pedido y es idempotente", async () => {
    const order = await newOrder();
    const charge = { status: 200, body: { object: "charge", id: "chr_wh", amount: 4000, outcome: { type: "venta_exitosa" }, metadata: { order_id: order.orderId }, source: { id: "ype_test_1" } } };
    const { client } = fakeCulqi([], { chr_wh: charge });
    const event = { object: "event", type: "charge.creation.succeeded", data: JSON.stringify({ id: "chr_wh" }) };

    const first = await handleCulqiEvent(db, client, event);
    expect(first).toMatchObject({ handled: true, reason: "pedido marcado como pagado" });
    // El primer aviso trae el cambio (salen los emails); el repetido no, así no se duplican.
    expect(first.change && planOrderEmails({ type: "status", change: first.change })).toEqual({ customer: "pagado", team: null });
    const again = await handleCulqiEvent(db, client, event);
    expect(again).toMatchObject({ handled: true, reason: "ya estaba registrado" });
    expect(again.change).toBeUndefined();
    const rows = await db.select().from(schema.payments).where(eq(schema.payments.orderId, order.orderId));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ method: "yape", amountCents: 4000 });
  });

  it("ignora eventos falsos: cargo inexistente o monto distinto", async () => {
    const order = await newOrder();
    const { client } = fakeCulqi([], {
      chr_bad: { status: 200, body: { object: "charge", id: "chr_bad", amount: 1, outcome: { type: "venta_exitosa" }, metadata: { order_id: order.orderId } } },
    });
    expect(await handleCulqiEvent(db, client, { type: "charge.creation.succeeded", data: { id: "chr_fake" } })).toMatchObject({ handled: false });
    expect(await handleCulqiEvent(db, client, { type: "charge.creation.succeeded", data: { id: "chr_bad" } })).toMatchObject({
      handled: false,
      reason: "el monto no coincide con el pedido",
    });
    expect((await getOrderByNumber(db, order.number))?.status).toBe("pendiente");
  });
});

describe("captura del pago con Yape/Plin", () => {
  const screenshot = () => sharp({ create: { width: 1170, height: 2532, channels: 3, background: "#7b2cbf" } }).png().toBuffer();

  it("la guarda achicada en WebP, pasa el pedido a por verificar y avisa al equipo", async () => {
    const order = await newOrder();
    const proof = await processProofImage(await screenshot());
    expect(proof.height).toBe(1400);
    const result = await submitPaymentProof(db, order.orderId, proof);
    expect(result).toMatchObject({ ok: true });
    expect(result.ok && result.change && planOrderEmails({ type: "status", change: result.change })).toEqual({ customer: "por_verificar", team: null });
    expect((await getOrderByNumber(db, order.number))?.status).toBe("por_verificar");

    // Una segunda captura (se equivocó de imagen) se suma sin volver a cambiar el estado.
    const again = await submitPaymentProof(db, order.orderId, proof);
    expect(again).toMatchObject({ ok: true, change: null });
    const proofs = await listPaymentProofs(db, order.orderId);
    expect(proofs).toHaveLength(2);
    const image = await getPaymentProofImage(db, proofs[0].id, order.orderId);
    expect(image?.contentType).toBe("image/webp");
    expect((await sharp(image!.image).metadata()).format).toBe("webp");
    // Con el id de otro pedido no se ve.
    expect(await getPaymentProofImage(db, proofs[0].id, randomUUID())).toBeNull();
  });

  it("el email al equipo lleva la captura en JPEG, dentro del email y adjunta", async () => {
    const order = await newOrder();
    const result = await submitPaymentProof(db, order.orderId, await processProofImage(await screenshot()));
    if (!result.ok) throw new Error("no se guardó la captura");
    const [admin] = await db.insert(schema.users).values({ name: "Admin Pagos", email: `admin-${randomUUID()}@example.com`, role: "admin" }).returning();

    const sent: { to: string[]; html: string; attachments?: { filename: string; content: string; content_type: string; content_id: string }[] }[] = [];
    const realFetch = globalThis.fetch;
    const env = { key: process.env.RESEND_API_KEY, from: process.env.EMAIL_FROM };
    process.env.RESEND_API_KEY = "re_test";
    process.env.EMAIL_FROM = "TWENTY <pedidos@example.com>";
    globalThis.fetch = (async (_url: string, init: RequestInit) => {
      sent.push(JSON.parse(String(init.body)));
      return new Response("{}", { status: 200 });
    }) as typeof fetch;
    try {
      await notifyOrderEvent(db, { type: "proof", orderId: order.orderId, proofId: result.proofId }, "https://tienda.example");
    } finally {
      globalThis.fetch = realFetch;
      process.env.RESEND_API_KEY = env.key;
      process.env.EMAIL_FROM = env.from;
      await db.delete(schema.users).where(eq(schema.users.id, admin.id));
    }

    expect(sent).toHaveLength(1);
    expect(sent[0].to).toContain(admin.email);
    expect(sent[0].html).toContain('src="cid:captura-pago"');
    const [attachment] = sent[0].attachments!;
    expect(attachment).toMatchObject({ filename: `captura-pedido-${order.number}.jpg`, content_type: "image/jpeg", content_id: "captura-pago" });
    expect((await sharp(Buffer.from(attachment.content, "base64")).metadata()).format).toBe("jpeg");
  });

  it("no acepta capturas en pedidos ya pagados, ni más del máximo, ni archivos que no son imagen", async () => {
    const order = await newOrder();
    const proof = await processProofImage(await screenshot());
    for (let i = 0; i < MAX_PROOFS_PER_ORDER; i++) await submitPaymentProof(db, order.orderId, proof);
    expect(await submitPaymentProof(db, order.orderId, proof)).toMatchObject({ ok: false });

    const paid = await newOrder();
    await db.update(schema.orders).set({ status: "pagado" }).where(eq(schema.orders.id, paid.orderId));
    expect(await submitPaymentProof(db, paid.orderId, proof)).toMatchObject({ ok: false });

    await expect(processProofImage(Buffer.from("no soy una imagen"))).rejects.toThrow("no es una imagen");
  });
});
