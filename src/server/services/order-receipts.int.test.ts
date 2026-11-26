import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "../db/client";

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
const { getDb, closeDb } = await import("../db/client");
const schema = await import("../db/schema");
const { placeOrder, changeOrderStatus } = await import("./orders");
const { refundOrder } = await import("./refunds");
const { getOrderReceipt, issueOrderReceipt, receiptForStatusChange, retryPendingOrderReceipts, setOrderReceiptType } = await import("./order-receipts");
const { emailOrderReceipt, emailPendingOrderReceipts } = await import("./receipt-emails");
const { freeSeries } = await import("./pos");
const { getOnlineWarehouseId } = await import("./stock");
type SunatClient = import("./sunat").SunatClient;

let db: Db;
const variantId = randomUUID();
const site = "https://tienda.example";

/** SUNAT falso: acepta (o responde lo que diga `emit`) y guarda lo que se le mandó. */
function fakeSunat(emit?: SunatClient["emit"]) {
  const calls: { payload: Record<string, unknown>; key: string }[] = [];
  const client: SunatClient = {
    emit: async (payload, key) => {
      calls.push({ payload, key });
      if (emit) return emit(payload, key);
      return { status: "aceptado", code: "0", message: "Aceptada", hash: "h=", ticketUrl: "https://api/t.pdf", pdfUrl: "https://api/a4.pdf", xmlUrl: null, cdrUrl: null };
    },
    voidDocument: async () => ({ status: "PENDIENTE", message: null }),
    lookupRuc: async () => null,
    lookupDni: async () => null,
  };
  return { client, calls };
}

/** Resend y el PDF de la API, de mentira. */
async function withMail(run: (sent: { to: string[]; subject: string; text: string; attachments?: { filename: string }[] }[]) => Promise<void>) {
  const sent: { to: string[]; subject: string; text: string; attachments?: { filename: string }[] }[] = [];
  const realFetch = globalThis.fetch;
  const env = { key: process.env.RESEND_API_KEY, from: process.env.EMAIL_FROM };
  process.env.RESEND_API_KEY = "re_test";
  process.env.EMAIL_FROM = "TWENTY <pedidos@example.com>";
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    if (String(url).endsWith(".pdf")) return new Response(new Uint8Array([37, 80, 68, 70]), { status: 200 });
    sent.push(JSON.parse(String(init?.body)));
    return new Response("{}", { status: 200 });
  }) as typeof fetch;
  try {
    await run(sent);
  } finally {
    globalThis.fetch = realFetch;
    process.env.RESEND_API_KEY = env.key;
    process.env.EMAIL_FROM = env.from;
  }
}

/** Pedido de 2 polos (S/ 80) con Yape, pagado y enviado; `invoice` = lo que eligió en el checkout. */
async function sentOrder(invoice: "boleta" | "factura" = "boleta") {
  const result = await placeOrder(db, {
    name: "Ana Díaz",
    phone: "999000000",
    email: "ana@example.com",
    documentType: "dni",
    documentNumber: "45678912",
    invoiceType: invoice,
    ...(invoice === "factura" ? { ruc: "20123456789", businessName: "ANA SAC" } : {}),
    shippingMethod: "recojo-en-tienda",
    paymentMethod: "yape_plin",
    items: [{ variantId, quantity: 2 }],
  } as never);
  if (!result.ok) throw new Error("no se creó el pedido");
  for (const to of ["pagado", "enviado"] as const) {
    const changed = await changeOrderStatus(db, { orderId: result.orderId, to, userId: null });
    if (!changed.ok) throw new Error(changed.message);
  }
  return result;
}

async function deliver(orderId: string) {
  const changed = await changeOrderStatus(db, { orderId, to: "entregado", userId: null });
  if (!changed.ok) throw new Error(changed.message);
  return changed.change;
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
  await db.insert(schema.productVariants).values({ id: variantId, productId: product.id, sku: "TMW-WEB", colorId: color.id, sizeId: size.id, priceCents: 4000, stock: 100 });
  await db.insert(schema.shippingMethods).values({ slug: "recojo-en-tienda", name: "Recojo en tienda", kind: "store_pickup" });
});

beforeEach(async () => {
  await db.execute(sql`TRUNCATE order_receipts, order_document_series, document_series, cash_sessions, refunds, refund_items, payments,
    order_status_history, order_items, orders, customers CASCADE`);
  await db.update(schema.productVariants).set({ stock: 100 }).where(eq(schema.productVariants.id, variantId));
});

afterAll(async () => {
  await closeDb();
});

describe("comprobante de los pedidos de la web", () => {
  it("al entregar sale la boleta B006 a SUNAT (una sola, aunque se repita) y llega al correo del pedido con el PDF", async () => {
    const order = await sentOrder();
    expect(await issueOrderReceipt(db, order.orderId, fakeSunat().client)).toEqual({ ok: false, message: "El comprobante sale cuando el pedido está entregado." });
    const change = await deliver(order.orderId);
    const { client, calls } = fakeSunat();
    await receiptForStatusChange(db, change, client);
    await receiptForStatusChange(db, change, client);
    const receipt = await getOrderReceipt(db, order.orderId);
    expect(receipt).toMatchObject({ documentType: "boleta", series: "B006", number: 1, totalCents: 8000, sunatStatus: "aceptado", customerDocumentNumber: "45678912" });
    expect(calls).toHaveLength(1);
    expect(calls[0].key).toBe(receipt!.id);
    expect(calls[0].payload).toMatchObject({ documento: "boleta", serie: "B006", numero: 1, cliente_tipo_de_documento: "1", cliente_denominacion: "ANA DÍAZ", total: "80.00" });

    await withMail(async (sent) => {
      expect(await emailPendingOrderReceipts(db, site)).toEqual({ checked: 1, sent: 1 });
      expect(sent[0]).toMatchObject({ to: ["ana@example.com"], subject: "Tu boleta B006-1 de TWENTY" });
      expect(sent[0].text).toContain(`tu pedido #${order.number} en la web de TWENTY`);
      expect(sent[0].attachments?.map((a) => a.filename)).toEqual(["boleta-B006-1.pdf"]);
      // Ya salió: no se repite solo, pero se puede reenviar desde el panel.
      expect(await emailPendingOrderReceipts(db, site)).toEqual({ checked: 0, sent: 0 });
      expect(await emailOrderReceipt(db, order.orderId, site, { force: true })).toBe("sent");
      expect(sent).toHaveLength(2);
    });
  });

  it("el equipo puede cambiarla por nota de venta (NV06, no va a SUNAT y sale enseguida) o por factura si hay RUC", async () => {
    const order = await sentOrder();
    expect(await setOrderReceiptType(db, order.orderId, "factura")).toEqual({ ok: false, message: "Para factura el cliente tiene que haber puesto su RUC y razón social en el checkout." });
    expect(await setOrderReceiptType(db, order.orderId, "nota_venta")).toEqual({ ok: true });
    const { client, calls } = fakeSunat();
    await receiptForStatusChange(db, await deliver(order.orderId), client);
    expect(await getOrderReceipt(db, order.orderId)).toMatchObject({ documentType: "nota_venta", series: "NV06", number: 1, sunatStatus: null });
    expect(calls).toHaveLength(0);
    expect(await setOrderReceiptType(db, order.orderId, "boleta")).toEqual({ ok: false, message: "El comprobante ya se emitió." });
    await withMail(async (sent) => {
      expect(await emailOrderReceipt(db, order.orderId, site)).toBe("sent");
      expect(sent[0].subject).toBe("Tu nota de venta NV06-1 de TWENTY");
      expect(sent[0].attachments ?? []).toHaveLength(0);
    });

    const factura = await sentOrder("factura");
    await receiptForStatusChange(db, await deliver(factura.orderId), client);
    expect(await getOrderReceipt(db, factura.orderId)).toMatchObject({ documentType: "factura", series: "F006", customerDocumentType: "ruc", customerName: "ANA SAC" });
    expect(calls.at(-1)?.payload).toMatchObject({ documento: "factura", cliente_tipo_de_documento: "6", cliente_numero_de_documento: "20123456789" });
  });

  it("si SUNAT no responde queda pendiente, no se manda por correo y el reintento usa la misma clave", async () => {
    const order = await sentOrder();
    const down = fakeSunat(async () => {
      throw new TypeError("fetch failed");
    });
    await receiptForStatusChange(db, await deliver(order.orderId), down.client);
    expect(await getOrderReceipt(db, order.orderId)).toMatchObject({ sunatStatus: "pendiente" });
    await withMail(async (sent) => {
      expect(await emailOrderReceipt(db, order.orderId, site)).toBe("waiting");
      const up = fakeSunat();
      expect(await retryPendingOrderReceipts(db, up.client)).toEqual({ checked: 1, accepted: 1 });
      expect(up.calls[0].key).toBe(down.calls[0].key);
      expect(await emailPendingOrderReceipts(db, site)).toEqual({ checked: 1, sent: 1 });
      expect(sent).toHaveLength(1);
    });
  });

  it("lo devuelto antes de entregar no va en el comprobante; si se devolvió todo, no hay comprobante", async () => {
    const order = await sentOrder();
    const [item] = await db.select({ id: schema.orderItems.id }).from(schema.orderItems).where(eq(schema.orderItems.orderId, order.orderId));
    const refund = await refundOrder(db, null, { orderId: order.orderId, amount: 4000, method: "manual", reason: "agotado", soldOut: [{ orderItemId: item.id, quantity: 1 }], userId: null });
    expect(refund.ok).toBe(true);
    const { client, calls } = fakeSunat();
    await receiptForStatusChange(db, await deliver(order.orderId), client);
    expect(await getOrderReceipt(db, order.orderId)).toMatchObject({ totalCents: 4000, items: [{ sku: "TMW-WEB", quantity: 1, totalCents: 4000 }] });
    expect(calls[0].payload).toMatchObject({ total: "40.00", items: [{ cantidad: "1" }] });

    const all = await sentOrder();
    expect((await refundOrder(db, null, { orderId: all.orderId, amount: "all", method: "manual", reason: "cliente", userId: null })).ok).toBe(true);
    await receiptForStatusChange(db, await deliver(all.orderId), client);
    expect(await getOrderReceipt(db, all.orderId)).toBeNull();
  });

  it("las series de la web y de la tienda no se repiten", async () => {
    const order = await sentOrder();
    await receiptForStatusChange(db, await deliver(order.orderId), fakeSunat().client);
    await db.insert(schema.documentSeries).values({ warehouseId: await getOnlineWarehouseId(db), documentType: "boleta", series: "B005" });
    // Una tienda nueva toma la primera libre: ni la B005 de Gamarra ni la B006 de la web.
    expect(await db.transaction((tx) => freeSeries(tx, "boleta", 5))).toBe("B007");
  });
});
