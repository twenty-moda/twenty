import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "../db/client";

// El cliente de BD lee DATABASE_URL: se apunta a la BD de tests antes de importarlo.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
const { getDb, closeDb } = await import("../db/client");
const schema = await import("../db/schema");
const { getOnlineWarehouseId } = await import("./stock");
const { openCashSession, registerSale } = await import("./pos");
const { getQuote, listQuotes, quoteForPos, saveQuote, voidQuote, formatQuoteNumber } = await import("./quotes");

let db: Db;
let store: string;
const ids = { category: randomUUID(), product: randomUUID(), color: randomUUID(), s: randomUUID(), m: randomUUID(), vs: randomUUID(), vm: randomUUID() };
const customer = { documentType: "ruc" as const, documentNumber: "20123456789", name: "Boutique Norte S.A.C.", phone: "987654321", email: null, address: "Av. Perú 123" };

beforeAll(async () => {
  db = getDb();
  await db.execute(sql`TRUNCATE quote_items, quotes, expenses, cash_sessions, document_series, order_status_history, order_items, orders, customers, promotion_products, promotions,
    product_images, product_redirects, product_variants, products, category_fits, categories, fits, colors, sizes RESTART IDENTITY CASCADE`);
  store = await getOnlineWarehouseId(db);
  await db.insert(schema.categories).values({ id: ids.category, slug: "polos", name: "Polos" });
  await db.insert(schema.colors).values({ id: ids.color, slug: "negro", name: "Negro" });
  await db.insert(schema.sizes).values([
    { id: ids.s, label: "S", position: 1 },
    { id: ids.m, label: "M", position: 2 },
  ]);
  await db.insert(schema.products).values({ id: ids.product, slug: "polo-boxy", name: "Polo Boxy", categoryId: ids.category, status: "active" });
  await db.insert(schema.productVariants).values([
    { id: ids.vs, productId: ids.product, sku: "TMW-Q1", colorId: ids.color, sizeId: ids.s, priceCents: 4000, stock: 30 },
    { id: ids.vm, productId: ids.product, sku: "TMW-Q2", colorId: ids.color, sizeId: ids.m, priceCents: 4000, stock: 30 },
  ]);
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE quote_items, quotes, cash_sessions, document_series, product_variants RESTART IDENTITY CASCADE`);
  await closeDb();
});

const input = (over: Record<string, unknown> = {}) => ({
  warehouseId: store,
  customer,
  validDays: 7,
  note: "Pago 50 % adelantado",
  lines: [
    { variantId: ids.vs, quantity: 12, unitPriceCents: 2500 },
    { variantId: ids.vm, quantity: 12, unitPriceCents: 2500 },
  ],
  ...over,
});

describe("cotizaciones", () => {
  it("guarda las prendas con el precio mayorista y el de lista, y se puede cambiar mientras está vigente", async () => {
    expect(await saveQuote(db, input({ lines: [] }), null)).toEqual({ ok: false, message: "Agrega al menos una prenda." });
    expect(await saveQuote(db, input({ customer: { ...customer, documentNumber: "123" } }), null)).toMatchObject({ ok: false });
    const created = await saveQuote(db, input(), null);
    expect(created).toEqual({ ok: true, number: 1 });
    const quote = (await getQuote(db, 1))!;
    expect([quote.subtotalCents, quote.totalCents, quote.items.length, quote.status]).toEqual([24 * 4000, 24 * 2500, 2, "vigente"]);
    expect(quote.items[0]).toMatchObject({ sku: "TMW-Q1", productName: "Polo Boxy", sizeLabel: "S", quantity: 12, listPriceCents: 4000, unitPriceCents: 2500, totalCents: 30000 });
    expect(formatQuoteNumber(quote.number)).toBe("COT-00001");

    expect(await saveQuote(db, input({ lines: [{ variantId: ids.vs, quantity: 24, unitPriceCents: 2400 }] }), null, quote.id)).toEqual({ ok: true, number: 1 });
    expect((await getQuote(db, 1))!.totalCents).toBe(24 * 2400);
    expect((await listQuotes(db, { status: "vigente" })).rows.map((r) => [r.number, r.units])).toEqual([[1, 24]]);
  });

  it("se vende en el punto de venta con el descuento que la deja en el total cotizado, una sola vez", async () => {
    await openCashSession(db, { warehouseId: store, openingCents: 0, userId: null });
    const pos = (await quoteForPos(db, 1))!;
    expect(pos).toMatchObject({ totalCents: 57600, lines: [{ variantId: ids.vs, quantity: 24 }], customer: { name: "Boutique Norte S.A.C." } });
    const sell = () =>
      registerSale(
        db,
        {
          warehouseId: store,
          documentType: "nota_venta",
          customer: { documentType: "ruc", documentNumber: customer.documentNumber, name: customer.name },
          lines: pos.lines,
          manualDiscountCents: 24 * 4000 - pos.totalCents,
          shippingCents: 0,
          payments: [{ method: "transferencia", amountCents: pos.totalCents, receivedCents: null, reference: "OP-1" }],
          note: null,
          quoteId: pos.id,
        },
        null,
      );
    const sold = await sell();
    expect(sold).toMatchObject({ ok: true, totalCents: 57600 });
    const quote = (await getQuote(db, 1))!;
    expect([quote.status, quote.saleSeries, quote.saleNumber]).toEqual(["vendida", "NV05", 1]);
    expect(await sell()).toEqual({ ok: false, message: "Esa cotización ya se vendió o se anuló." });
    expect(await quoteForPos(db, 1)).toBeNull();
    expect(await voidQuote(db, quote.id)).toMatchObject({ ok: false });
    expect(await saveQuote(db, input(), null, quote.id)).toEqual({ ok: false, message: "Solo se cambia una cotización vigente (sin vender ni anular)." });
  });

  it("anular deja la cotización fuera de las vigentes", async () => {
    const created = await saveQuote(db, input(), null);
    if (!created.ok) throw new Error("cotización");
    const [row] = await db.select({ id: schema.quotes.id }).from(schema.quotes).where(eq(schema.quotes.number, created.number));
    expect(await voidQuote(db, row.id)).toEqual({ ok: true });
    expect((await listQuotes(db, { status: "anulada" })).rows.map((r) => r.number)).toEqual([created.number]);
    expect((await listQuotes(db, { q: "boutique" })).total).toBe(2);
  });
});
