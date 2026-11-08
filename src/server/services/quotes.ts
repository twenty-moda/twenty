/**
 * Cotizaciones para clientes mayoristas (pedido de TWENTY, 08/11/2026). Una cotización lista prendas con el precio por
 * unidad que se le ofrece al cliente (puede ser menor que el de lista), no mueve stock ni va a SUNAT. Al venderla, el
 * punto de venta la abre con sus prendas y el descuento que la deja en el total cotizado (`quoteForPos`), y la venta
 * la marca como vendida en la misma transacción (`registerSale`).
 */
import { and, asc, desc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import { checkCustomer } from "@/lib/pos";
import { addDays, todayInLima } from "@/lib/reports";
import type { Db } from "../db/client";
import { colors, documentType, posSales, products, productVariants, quoteItems, quotes, sizes, users, warehouses } from "../db/schema";

type Fail = { ok: false; message: string };

const nullableText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => v || null);

export const quoteInputSchema = z.object({
  warehouseId: z.uuid("Elige la tienda"),
  customer: z.object({
    documentType: z.enum(documentType.enumValues).nullish(),
    documentNumber: nullableText(20),
    name: z.string().trim().min(2, "Escribe el nombre o la razón social del cliente").max(200),
    phone: nullableText(20),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .max(120)
      .nullish()
      .transform((v) => v || null)
      .pipe(z.email("Revisa el correo").nullable()),
    address: nullableText(200),
  }),
  validDays: z.number().int().min(1, "La validez es de 1 a 90 días").max(90, "La validez es de 1 a 90 días"),
  note: nullableText(1000),
  lines: z
    .array(
      z.object({
        variantId: z.uuid(),
        quantity: z.number().int().positive("Cada prenda lleva al menos 1").max(99_999),
        unitPriceCents: z.number().int().positive("Cada prenda lleva un precio mayor que S/ 0"),
      }),
    )
    .min(1, "Agrega al menos una prenda.")
    .max(400),
});
export type QuoteInput = z.input<typeof quoteInputSchema>;

/** "COT-00012" */
export const formatQuoteNumber = (n: number) => `COT-${String(n).padStart(5, "0")}`;

/** Crea la cotización o, con `quoteId`, la reemplaza (solo si sigue vigente). Los nombres y el precio de lista se copian. */
export async function saveQuote(db: Db, raw: QuoteInput, userId: string | null, quoteId?: string): Promise<{ ok: true; number: number } | Fail> {
  const parsed = quoteInputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const input = parsed.data;
  const customer = input.customer;
  if (customer.documentNumber && !customer.documentType) return { ok: false, message: "Elige el tipo de documento del cliente." };
  const problem = checkCustomer("nota_venta", 0, { documentType: customer.documentType ?? null, documentNumber: customer.documentNumber, name: customer.name });
  if (problem) return { ok: false, message: problem };
  const ids = input.lines.map((l) => l.variantId);
  if (new Set(ids).size !== ids.length) return { ok: false, message: "Una prenda está dos veces: junta las cantidades en una sola línea." };

  const rows = await db
    .select({ id: productVariants.id, sku: productVariants.sku, priceCents: productVariants.priceCents, productId: products.id, productName: products.name, colorName: colors.name, sizeLabel: sizes.label })
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .innerJoin(colors, eq(colors.id, productVariants.colorId))
    .innerJoin(sizes, eq(sizes.id, productVariants.sizeId))
    .where(inArray(productVariants.id, ids));
  if (rows.length !== ids.length) return { ok: false, message: "Una de las prendas ya no existe. Recarga la página." };
  const byId = new Map(rows.map((r) => [r.id, r]));
  const items = input.lines.map((l, position) => {
    const v = byId.get(l.variantId)!;
    return {
      variantId: v.id,
      productId: v.productId,
      sku: v.sku,
      productName: v.productName,
      colorName: v.colorName,
      sizeLabel: v.sizeLabel,
      quantity: l.quantity,
      listPriceCents: v.priceCents,
      unitPriceCents: l.unitPriceCents,
      totalCents: l.unitPriceCents * l.quantity,
      position,
    };
  });
  const values = {
    warehouseId: input.warehouseId,
    customerDocumentType: customer.documentNumber ? (customer.documentType ?? null) : null,
    customerDocumentNumber: customer.documentNumber,
    customerName: customer.name,
    customerPhone: customer.phone,
    customerEmail: customer.email,
    customerAddress: customer.address,
    validUntil: addDays(todayInLima(), input.validDays),
    note: input.note,
    subtotalCents: items.reduce((s, i) => s + i.listPriceCents * i.quantity, 0),
    totalCents: items.reduce((s, i) => s + i.totalCents, 0),
  };

  return db.transaction(async (tx) => {
    let id: string;
    let number: number;
    if (quoteId) {
      const [current] = await tx.select({ status: quotes.status }).from(quotes).where(eq(quotes.id, quoteId)).for("update");
      if (!current) return { ok: false as const, message: "Esa cotización no existe." };
      if (current.status !== "vigente") return { ok: false as const, message: "Solo se cambia una cotización vigente (sin vender ni anular)." };
      [{ id, number }] = await tx.update(quotes).set({ ...values, updatedAt: new Date() }).where(eq(quotes.id, quoteId)).returning({ id: quotes.id, number: quotes.number });
      await tx.delete(quoteItems).where(eq(quoteItems.quoteId, id));
    } else {
      [{ id, number }] = await tx
        .insert(quotes)
        .values({ ...values, userId })
        .returning({ id: quotes.id, number: quotes.number });
    }
    await tx.insert(quoteItems).values(items.map((i) => ({ ...i, quoteId: id })));
    return { ok: true as const, number };
  });
}

export async function voidQuote(db: Db, quoteId: string): Promise<{ ok: true } | Fail> {
  const [updated] = await db
    .update(quotes)
    .set({ status: "anulada", updatedAt: new Date() })
    .where(and(eq(quotes.id, quoteId), eq(quotes.status, "vigente")))
    .returning({ id: quotes.id });
  return updated ? { ok: true } : { ok: false, message: "Solo se anula una cotización vigente." };
}

// ─── Lectura ─────────────────────────────────────────────────────────────────

const createdBy = alias(users, "quote_user");
const QUOTES_ID = sql.raw(`"quotes"."id"`);
export const QUOTES_PAGE_SIZE = 40;
export type QuoteListStatus = "vigente" | "vencida" | "vendida" | "anulada";

export async function listQuotes(db: Db, { q, status, page = 1 }: { q?: string; status?: QuoteListStatus; page?: number } = {}) {
  const today = todayInLima();
  const conditions: SQL[] = [];
  if (status === "vigente") conditions.push(eq(quotes.status, "vigente"), sql`${quotes.validUntil} >= ${today}`);
  else if (status === "vencida") conditions.push(eq(quotes.status, "vigente"), sql`${quotes.validUntil} < ${today}`);
  else if (status) conditions.push(eq(quotes.status, status));
  if (q?.trim()) {
    const like = `%${q.trim()}%`;
    const n = Number(q.trim().replace(/^cot-?/i, ""));
    conditions.push(or(ilike(quotes.customerName, like), ilike(quotes.customerDocumentNumber, like), ilike(quotes.customerPhone, like), Number.isInteger(n) && n > 0 ? eq(quotes.number, n) : undefined)!);
  }
  const where = conditions.length ? and(...conditions) : undefined;
  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: quotes.id,
        number: quotes.number,
        createdAt: quotes.createdAt,
        customerName: quotes.customerName,
        customerDocumentNumber: quotes.customerDocumentNumber,
        customerPhone: quotes.customerPhone,
        status: quotes.status,
        validUntil: quotes.validUntil,
        subtotalCents: quotes.subtotalCents,
        totalCents: quotes.totalCents,
        userName: createdBy.name,
        units: sql<number>`(select coalesce(sum(i.quantity), 0)::int from ${quoteItems} i where i.quote_id = ${QUOTES_ID})`,
      })
      .from(quotes)
      .leftJoin(createdBy, eq(createdBy.id, quotes.userId))
      .where(where)
      .orderBy(desc(quotes.number))
      .limit(QUOTES_PAGE_SIZE)
      .offset((page - 1) * QUOTES_PAGE_SIZE),
    db.select({ total: sql<number>`count(*)::int` }).from(quotes).where(where),
  ]);
  return { rows, total, page, pageCount: Math.max(1, Math.ceil(total / QUOTES_PAGE_SIZE)), today };
}

export async function getQuote(db: Db, number: number) {
  const [row] = await db
    .select({ quote: quotes, userName: createdBy.name, warehouseName: warehouses.name, warehouseAddress: warehouses.address, saleSeries: posSales.series, saleNumber: posSales.number })
    .from(quotes)
    .innerJoin(warehouses, eq(warehouses.id, quotes.warehouseId))
    .leftJoin(createdBy, eq(createdBy.id, quotes.userId))
    .leftJoin(posSales, eq(posSales.id, quotes.posSaleId))
    .where(eq(quotes.number, number))
    .limit(1);
  if (!row) return null;
  const items = await db.select().from(quoteItems).where(eq(quoteItems.quoteId, row.quote.id)).orderBy(asc(quoteItems.position));
  return { ...row.quote, userName: row.userName, warehouseName: row.warehouseName, warehouseAddress: row.warehouseAddress, saleSeries: row.saleSeries, saleNumber: row.saleNumber, items };
}
export type QuoteDetail = NonNullable<Awaited<ReturnType<typeof getQuote>>>;

/** Lo que necesita el punto de venta para cobrar una cotización vigente (sus prendas que aún existen, el total y el cliente). */
export async function quoteForPos(db: Db, number: number) {
  const quote = await getQuote(db, number);
  if (!quote || quote.status !== "vigente") return null;
  const lines = quote.items.filter((i): i is typeof i & { variantId: string } => !!i.variantId).map((i) => ({ variantId: i.variantId, quantity: i.quantity }));
  return {
    id: quote.id,
    number: quote.number,
    warehouseId: quote.warehouseId,
    totalCents: quote.items.filter((i) => i.variantId).reduce((s, i) => s + i.totalCents, 0),
    missing: quote.items.filter((i) => !i.variantId).length,
    lines,
    customer: { documentType: quote.customerDocumentType, documentNumber: quote.customerDocumentNumber, name: quote.customerName, address: quote.customerAddress },
  };
}
export type PosQuote = NonNullable<Awaited<ReturnType<typeof quoteForPos>>>;
