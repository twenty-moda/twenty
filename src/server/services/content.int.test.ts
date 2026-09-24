import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { complaintSchema } from "@/lib/public-forms";
import type { Db } from "../db/client";

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
const { getDb, closeDb } = await import("../db/client");
const schema = await import("../db/schema");
const { createComplaint, getComplaintByNumber, listComplaints, respondComplaint, countPendingComplaints } = await import("./complaints");
const { consumeRateLimit } = await import("./rate-limit");
const { placeOrder, findOrderIdForTracking } = await import("./orders");
const { subscribe, listSubscribers, createContactMessage, countNewMessages, setMessageHandled } = await import("./messages");
const { savePost, listPublishedPosts, getPublishedPost } = await import("./posts");

let db: Db;
const variantId = randomUUID();

const complaintInput = (overrides: Record<string, unknown> = {}) =>
  complaintSchema.parse({
    type: "reclamo",
    name: "Cliente Prueba",
    documentType: "dni",
    documentNumber: "00000000",
    phone: "999000000",
    email: "reclamo@example.com",
    ubigeo: "150101",
    address: "Calle Falsa 123",
    itemType: "producto",
    amount: "99",
    itemDescription: "Polo negro M",
    incidentDate: "",
    detail: "Llegó con una mancha de fábrica.",
    request: "Cambio de la prenda",
    accepted: true,
    ...overrides,
  });

beforeAll(async () => {
  db = getDb();
  await db.execute(sql`TRUNCATE complaints, contact_messages, subscribers, posts, rate_limit_hits, payments, order_status_history, order_items, orders, customers,
    promotion_products, promotions, product_images, product_redirects, product_variants, products, category_fits, categories, fits, colors, sizes,
    districts, shipping_methods CASCADE`);
  await db.insert(schema.districts).values({ ubigeo: "150101", name: "Lima", province: "Lima", department: "Lima", deliveryPriceCents: 1000 });
  const [category] = await db.insert(schema.categories).values({ slug: "polos", name: "Polos" }).returning();
  const [color] = await db.insert(schema.colors).values({ slug: "negro", name: "Negro" }).returning();
  const [size] = await db.insert(schema.sizes).values({ label: "M" }).returning();
  const [product] = await db.insert(schema.products).values({ slug: "polo", name: "Polo", categoryId: category.id, status: "active" }).returning();
  await db.insert(schema.productVariants).values({ id: variantId, productId: product.id, sku: "TMW-CNT", colorId: color.id, sizeId: size.id, priceCents: 4000, stock: 10 });
  await db.insert(schema.shippingMethods).values({ slug: "recojo-en-tienda", name: "Recojo en tienda", kind: "store_pickup" });
});

afterAll(async () => {
  await closeDb();
});

describe("Libro de Reclamaciones", () => {
  it("numera las hojas en orden y guarda el distrito", async () => {
    const a = await createComplaint(db, complaintInput());
    const b = await createComplaint(db, complaintInput({ type: "queja" }));
    if (!a.ok || !b.ok) throw new Error("no se creó");
    expect(b.complaint.number).toBe(a.complaint.number + 1);
    expect(a.complaint).toMatchObject({ district: "Lima", province: "Lima", amountCents: 9900, respondedAt: null });
  });

  it("rechaza un ubigeo que no existe", async () => {
    expect(await createComplaint(db, complaintInput({ ubigeo: "999999" }))).toMatchObject({ ok: false, field: "ubigeo" });
  });

  it("la respuesta conserva la primera fecha (la que cuenta para el plazo)", async () => {
    const created = await createComplaint(db, complaintInput());
    if (!created.ok) throw new Error("no se creó");
    const [admin] = await db.insert(schema.users).values({ name: "Admin", email: `admin-${randomUUID()}@example.com`, role: "admin" }).returning();
    const pendingBefore = await countPendingComplaints(db);
    const first = await respondComplaint(db, created.complaint.number, "Te cambiamos la prenda.", admin.id, new Date("2026-09-25T15:00:00Z"));
    const second = await respondComplaint(db, created.complaint.number, "Te cambiamos la prenda esta semana.", admin.id, new Date("2026-09-28T15:00:00Z"));
    expect(first?.firstResponse).toBe(true);
    expect(second?.firstResponse).toBe(false);
    const saved = await getComplaintByNumber(db, created.complaint.number);
    expect(saved).toMatchObject({ response: "Te cambiamos la prenda esta semana.", respondedByName: "Admin", daysLeft: null });
    expect(saved?.respondedAt?.toISOString()).toBe("2026-09-25T15:00:00.000Z");
    expect(await countPendingComplaints(db)).toBe(pendingBefore - 1);
    const { rows } = await listComplaints(db, { filter: "respondidos" });
    expect(rows.map((r) => r.number)).toContain(created.complaint.number);
  });
});

describe("límite de formularios", () => {
  it("bloquea al pasar el límite y vuelve a permitir al terminar la ventana", async () => {
    const key = `test:${randomUUID()}`;
    const limit = { limit: 2, windowMinutes: 10 };
    const t0 = new Date("2026-09-24T10:00:00Z");
    expect(await consumeRateLimit(db, key, limit, t0)).toBe(true);
    expect(await consumeRateLimit(db, key, limit, t0)).toBe(true);
    expect(await consumeRateLimit(db, key, limit, t0)).toBe(false);
    expect(await consumeRateLimit(db, key, limit, new Date(t0.getTime() + 11 * 60 * 1000))).toBe(true);
    expect(await consumeRateLimit(db, `otro:${randomUUID()}`, limit, t0)).toBe(true);
  });
});

describe("rastreo de pedidos", () => {
  it("solo con el celular o el email de la compra", async () => {
    const order = await placeOrder(db, {
      name: "Rosa Díaz",
      phone: "987654321",
      email: "rosa@example.com",
      documentType: "dni",
      documentNumber: "11111111",
      invoiceType: "boleta",
      shippingMethod: "recojo-en-tienda",
      paymentMethod: "yape_plin",
      items: [{ variantId, quantity: 1 }],
    } as never);
    if (!order.ok) throw new Error("no se creó el pedido");
    expect(await findOrderIdForTracking(db, order.number, "+51 987 654 321")).toBe(order.orderId);
    expect(await findOrderIdForTracking(db, order.number, "ROSA@example.com")).toBe(order.orderId);
    expect(await findOrderIdForTracking(db, order.number, "900000000")).toBeNull();
    expect(await findOrderIdForTracking(db, order.number + 999, "987654321")).toBeNull();
  });
});

describe("mensajes y boletín", () => {
  it("suscribir dos veces el mismo email no duplica", async () => {
    await subscribe(db, "Fan@Example.com");
    await subscribe(db, "fan@example.com");
    expect((await listSubscribers(db)).filter((s) => s.email === "fan@example.com")).toHaveLength(1);
  });

  it("un mensaje nuevo cuenta hasta que se atiende", async () => {
    const before = await countNewMessages(db);
    const msg = await createContactMessage(db, { name: "Luis", email: "luis@example.com", phone: null, message: "¿Tienen talla 30?" });
    expect(await countNewMessages(db)).toBe(before + 1);
    await setMessageHandled(db, msg.id, true);
    expect(await countNewMessages(db)).toBe(before);
  });
});

describe("blog", () => {
  const base = { summary: null, category: "Guías", author: "TWENTY", metaTitle: null, metaDescription: null, image: null, body: "Texto del artículo con suficiente contenido." };

  it("no repite URLs y solo muestra lo publicado con fecha pasada", async () => {
    const now = new Date("2026-09-24T12:00:00Z");
    const a = await savePost(db, null, { ...base, title: "Cómo elegir tu talla", slug: null, isPublished: true, publishedAt: new Date("2026-09-01T12:00:00Z") });
    expect(a).toMatchObject({ ok: true, slug: "como-elegir-tu-talla" });
    expect(await savePost(db, null, { ...base, title: "Otro", slug: "como-elegir-tu-talla", isPublished: true, publishedAt: now })).toMatchObject({ ok: false, field: "slug" });
    await savePost(db, null, { ...base, title: "Borrador", slug: null, isPublished: false, publishedAt: now });
    await savePost(db, null, { ...base, title: "Programado", slug: null, isPublished: true, publishedAt: new Date("2026-12-01T12:00:00Z") });

    const list = await listPublishedPosts(db, now);
    expect(list.map((p) => p.slug)).toEqual(["como-elegir-tu-talla"]);
    expect(list[0].summary).toBe("Texto del artículo con suficiente contenido.");
    expect(await getPublishedPost(db, "programado", now)).toBeNull();
  });

  it("al cambiar la URL avisa cuál era la anterior", async () => {
    const created = await savePost(db, null, { ...base, title: "Lavado de jeans", slug: null, isPublished: true, publishedAt: new Date("2026-09-01T12:00:00Z") });
    if (!created.ok) throw new Error("no se creó");
    const renamed = await savePost(db, created.id, { ...base, title: "Lavado de jeans", slug: "como-lavar-jeans", isPublished: true, publishedAt: new Date("2026-09-01T12:00:00Z") });
    expect(renamed).toMatchObject({ ok: true, slug: "como-lavar-jeans", previousSlug: "lavado-de-jeans" });
  });
});
