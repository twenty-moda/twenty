/** Punto de venta y caja de la tienda: abrir y cerrar caja, vender, anular. El stock se mueve en `stock.ts`. */
import { and, asc, desc, eq, ilike, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import { PAYMENT_METHODS, saleTotal, settlePayments, type PaymentMethod } from "@/lib/pos";
import { priceLines, type PricedPromotion } from "@/lib/pricing";
import type { Db } from "../db/client";
import {
  cashMovements,
  cashSessions,
  colors,
  customers,
  documentSeries,
  documentType,
  posDocumentType,
  posPayments,
  posSaleItems,
  posSales,
  products,
  productVariants,
  sizes,
  users,
  warehouses,
} from "../db/schema";
import { activePromotionsByProduct } from "./catalog";
import { listPickerVariants, type PickerVariant } from "./inventory";
import { InsufficientStockError, moveStock } from "./stock";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Conn = Db | Tx;
type Fail = { ok: false; message: string };

// ─── Series ──────────────────────────────────────────────────────────────────

type DocumentType = (typeof posDocumentType.enumValues)[number];
const SERIES_PREFIX: Record<DocumentType, string> = { nota_venta: "NV", boleta: "B", factura: "F" };
/** Las series empiezan en 05: Insaga usa 03 (Gamarra) y 04 (San Juan de Miraflores), y un comprobante no puede repetir serie y número. */
const FIRST_SERIES = 5;

/**
 * Toma el siguiente número de la serie de la tienda. Es un UPDATE dentro de la transacción de la venta: si la venta
 * falla, el número vuelve (no quedan huecos), y dos ventas a la vez se ordenan solas. La primera venta crea la serie.
 */
async function takeNumber(tx: Tx, warehouseId: string, type: DocumentType): Promise<{ series: string; number: number }> {
  const [taken] = await tx
    .update(documentSeries)
    .set({ nextNumber: sql`${documentSeries.nextNumber} + 1`, updatedAt: new Date() })
    .where(and(eq(documentSeries.warehouseId, warehouseId), eq(documentSeries.documentType, type)))
    .returning({ series: documentSeries.series, number: sql<number>`${documentSeries.nextNumber} - 1` });
  if (taken) return taken;
  const used = new Set((await tx.select({ series: documentSeries.series }).from(documentSeries).where(eq(documentSeries.documentType, type))).map((s) => s.series));
  const prefix = SERIES_PREFIX[type];
  const code = (n: number) => `${prefix}${String(n).padStart(prefix.length === 1 ? 3 : 2, "0")}`;
  let n = FIRST_SERIES;
  while (used.has(code(n))) n++;
  const [created] = await tx
    .insert(documentSeries)
    .values({ warehouseId, documentType: type, series: code(n), nextNumber: 2 })
    .onConflictDoNothing()
    .returning({ series: documentSeries.series });
  // Otra venta creó la serie al mismo tiempo: se toma el número de la que quedó.
  return created ? { series: created.series, number: 1 } : takeNumber(tx, warehouseId, type);
}

// ─── Caja ────────────────────────────────────────────────────────────────────

export async function getOpenSession(db: Conn, warehouseId: string) {
  const [session] = await db
    .select({ id: cashSessions.id, number: cashSessions.number, openingCents: cashSessions.openingCents, openedAt: cashSessions.openedAt })
    .from(cashSessions)
    .where(and(eq(cashSessions.warehouseId, warehouseId), isNull(cashSessions.closedAt)))
    .limit(1);
  return session ?? null;
}

export async function openCashSession(db: Db, input: { warehouseId: string; openingCents: number; userId: string | null }): Promise<{ ok: true; number: number } | Fail> {
  if (!Number.isInteger(input.openingCents) || input.openingCents < 0) return { ok: false, message: "El monto inicial no es válido." };
  const [warehouse] = await db.select({ isActive: warehouses.isActive }).from(warehouses).where(eq(warehouses.id, input.warehouseId));
  if (!warehouse?.isActive) return { ok: false, message: "Esa tienda no existe o está desactivada." };
  const [created] = await db
    .insert(cashSessions)
    .values({ warehouseId: input.warehouseId, openingCents: input.openingCents, openedBy: input.userId })
    .onConflictDoNothing()
    .returning({ number: cashSessions.number });
  return created ? { ok: true, number: created.number } : { ok: false, message: "Ya hay una caja abierta en esta tienda." };
}

export const cashMovementSchema = z.object({
  type: z.enum(["ingreso", "egreso"]),
  amountCents: z.number().int().positive("El monto debe ser mayor que S/ 0"),
  note: z.string().trim().min(3, "Escribe el motivo").max(200),
});

export async function addCashMovement(db: Db, sessionId: string, input: z.infer<typeof cashMovementSchema>, userId: string | null): Promise<{ ok: true } | Fail> {
  return db.transaction(async (tx) => {
    const [session] = await tx.select({ closedAt: cashSessions.closedAt }).from(cashSessions).where(eq(cashSessions.id, sessionId)).for("share");
    if (!session || session.closedAt) return { ok: false as const, message: "La caja ya está cerrada." };
    await tx.insert(cashMovements).values({ sessionId, ...input, userId });
    return { ok: true as const };
  });
}

/** Totales de la caja: ventas por medio de pago, ingresos, egresos y el efectivo que debería haber. */
export async function getSessionTotals(db: Conn, sessionId: string) {
  const [byMethod, [sales], movements] = await Promise.all([
    db
      .select({ method: posPayments.method, cents: sql<number>`coalesce(sum(${posPayments.amountCents}), 0)::int` })
      .from(posPayments)
      .innerJoin(posSales, eq(posSales.id, posPayments.saleId))
      .where(and(eq(posSales.cashSessionId, sessionId), eq(posSales.status, "pagada")))
      .groupBy(posPayments.method),
    db
      .select({
        count: sql<number>`count(*) filter (where ${posSales.status} = 'pagada')::int`,
        voided: sql<number>`count(*) filter (where ${posSales.status} = 'anulada')::int`,
        totalCents: sql<number>`coalesce(sum(${posSales.totalCents}) filter (where ${posSales.status} = 'pagada'), 0)::int`,
      })
      .from(posSales)
      .where(eq(posSales.cashSessionId, sessionId)),
    db
      .select({ type: cashMovements.type, cents: sql<number>`coalesce(sum(${cashMovements.amountCents}), 0)::int` })
      .from(cashMovements)
      .where(eq(cashMovements.sessionId, sessionId))
      .groupBy(cashMovements.type),
  ]);
  const methods = Object.fromEntries(PAYMENT_METHODS.map((m) => [m, byMethod.find((r) => r.method === m)?.cents ?? 0])) as Record<PaymentMethod, number>;
  const ingresosCents = movements.find((m) => m.type === "ingreso")?.cents ?? 0;
  const egresosCents = movements.find((m) => m.type === "egreso")?.cents ?? 0;
  return { salesCount: sales.count, voidedCount: sales.voided, salesCents: sales.totalCents, methods, ingresosCents, egresosCents };
}

/** Efectivo que debería haber: lo inicial + lo cobrado en efectivo (sin el vuelto) + ingresos − egresos. */
export const expectedCash = (openingCents: number, totals: Awaited<ReturnType<typeof getSessionTotals>>) =>
  openingCents + totals.methods.efectivo + totals.ingresosCents - totals.egresosCents;

export async function closeCashSession(db: Db, input: { sessionId: string; countedCashCents: number; note: string | null; userId: string | null }): Promise<{ ok: true; expectedCashCents: number } | Fail> {
  if (!Number.isInteger(input.countedCashCents) || input.countedCashCents < 0) return { ok: false, message: "El efectivo contado no es válido." };
  return db.transaction(async (tx) => {
    // FOR UPDATE: espera a las ventas en curso (toman la caja con FOR SHARE) y no deja vender durante el cierre.
    const [session] = await tx.select().from(cashSessions).where(eq(cashSessions.id, input.sessionId)).for("update");
    if (!session) return { ok: false as const, message: "La caja no existe." };
    if (session.closedAt) return { ok: false as const, message: "La caja ya está cerrada." };
    const expectedCashCents = expectedCash(session.openingCents, await getSessionTotals(tx, session.id));
    await tx
      .update(cashSessions)
      .set({ expectedCashCents, countedCashCents: input.countedCashCents, closingNote: input.note?.trim() || null, closedBy: input.userId, closedAt: new Date() })
      .where(eq(cashSessions.id, session.id));
    return { ok: true as const, expectedCashCents };
  });
}

const openedBy = alias(users, "opened_by");
const closedBy = alias(users, "closed_by");

export async function getCashSession(db: Db, number: number) {
  const [session] = await db
    .select({
      id: cashSessions.id,
      number: cashSessions.number,
      warehouseId: cashSessions.warehouseId,
      warehouseName: warehouses.name,
      openingCents: cashSessions.openingCents,
      openedAt: cashSessions.openedAt,
      openedByName: openedBy.name,
      closedAt: cashSessions.closedAt,
      closedByName: closedBy.name,
      expectedCashCents: cashSessions.expectedCashCents,
      countedCashCents: cashSessions.countedCashCents,
      closingNote: cashSessions.closingNote,
    })
    .from(cashSessions)
    .innerJoin(warehouses, eq(warehouses.id, cashSessions.warehouseId))
    .leftJoin(openedBy, eq(openedBy.id, cashSessions.openedBy))
    .leftJoin(closedBy, eq(closedBy.id, cashSessions.closedBy))
    .where(eq(cashSessions.number, number))
    .limit(1);
  if (!session) return null;
  const [totals, movements] = await Promise.all([
    getSessionTotals(db, session.id),
    db
      .select({ id: cashMovements.id, type: cashMovements.type, amountCents: cashMovements.amountCents, note: cashMovements.note, createdAt: cashMovements.createdAt, userName: users.name })
      .from(cashMovements)
      .leftJoin(users, eq(users.id, cashMovements.userId))
      .where(eq(cashMovements.sessionId, session.id))
      .orderBy(asc(cashMovements.createdAt)),
  ]);
  return { ...session, totals, movements, expectedNowCents: expectedCash(session.openingCents, totals) };
}

export const CASH_SESSIONS_PAGE_SIZE = 30;

export async function listCashSessions(db: Db, { page = 1 }: { page?: number } = {}) {
  const SESSION_ID = sql.raw(`"cash_sessions"."id"`);
  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        number: cashSessions.number,
        warehouseName: warehouses.name,
        openedAt: cashSessions.openedAt,
        closedAt: cashSessions.closedAt,
        openedByName: openedBy.name,
        expectedCashCents: cashSessions.expectedCashCents,
        countedCashCents: cashSessions.countedCashCents,
        salesCents: sql<number>`(select coalesce(sum(s.total_cents), 0)::int from ${posSales} s where s.cash_session_id = ${SESSION_ID} and s.status = 'pagada')`,
        salesCount: sql<number>`(select count(*)::int from ${posSales} s where s.cash_session_id = ${SESSION_ID} and s.status = 'pagada')`,
      })
      .from(cashSessions)
      .innerJoin(warehouses, eq(warehouses.id, cashSessions.warehouseId))
      .leftJoin(openedBy, eq(openedBy.id, cashSessions.openedBy))
      .orderBy(desc(cashSessions.number))
      .limit(CASH_SESSIONS_PAGE_SIZE)
      .offset((page - 1) * CASH_SESSIONS_PAGE_SIZE),
    db.select({ total: sql<number>`count(*)::int` }).from(cashSessions),
  ]);
  return { rows, total, page, pageCount: Math.max(1, Math.ceil(total / CASH_SESSIONS_PAGE_SIZE)) };
}

// ─── Catálogo del POS ────────────────────────────────────────────────────────

export type PosVariant = PickerVariant & { stock: number; promotion: PricedPromotion | null };

/** Todas las prendas (también las que no están publicadas en la web) con su stock en la tienda y su promo vigente. */
export async function listPosVariants(db: Db, warehouseId: string): Promise<PosVariant[]> {
  const variants = await listPickerVariants(db);
  const promotions = await activePromotionsByProduct(db, [...new Set(variants.map((v) => v.productId))], new Date());
  return variants.map((v) => ({ ...v, stock: v.levels[warehouseId] ?? 0, promotion: promotions.get(v.productId) ?? null }));
}

// ─── Venta ───────────────────────────────────────────────────────────────────

export const saleInputSchema = z.object({
  warehouseId: z.uuid(),
  documentType: z.enum(["nota_venta"]),
  customer: z
    .object({
      documentType: z.enum(documentType.enumValues).nullable(),
      documentNumber: z.string().trim().max(20).nullable(),
      name: z.string().trim().max(120).nullable(),
    })
    .nullable(),
  lines: z
    .array(z.object({ variantId: z.uuid(), quantity: z.number().int().positive().max(999) }))
    .min(1, "Agrega al menos una prenda.")
    .max(200),
  manualDiscountCents: z.number().int().min(0),
  shippingCents: z.number().int().min(0),
  payments: z
    .array(
      z.object({
        method: z.enum(PAYMENT_METHODS),
        amountCents: z.number().int().positive(),
        receivedCents: z.number().int().positive().nullable(),
        reference: z.string().trim().max(60).nullable(),
      }),
    )
    .min(1, "Falta el pago.")
    .max(5),
  note: z.string().trim().max(300).nullable(),
});
export type SaleInput = z.infer<typeof saleInputSchema>;

export type RegisterSaleResult =
  | { ok: true; saleId: string; series: string; number: number; totalCents: number; changeCents: number; productSlugs: string[]; soldOut: boolean }
  | (Fail & { variantId?: string });

/**
 * Cobra una venta. El precio y las promos los recalcula el servidor (los mismos de la web), y en una sola transacción:
 * toma la caja abierta (FOR SHARE: no se puede cerrar a mitad de una venta), el número de la serie, guarda la venta
 * y descuenta el stock de la tienda. Si una prenda no alcanza, no se vende nada ni se gasta un número.
 */
export async function registerSale(db: Db, input: SaleInput, sellerId: string | null): Promise<RegisterSaleResult> {
  const quantities = new Map<string, number>();
  for (const l of input.lines) quantities.set(l.variantId, (quantities.get(l.variantId) ?? 0) + l.quantity);
  const variantIds = [...quantities.keys()];
  const rows = await db
    .select({
      id: productVariants.id,
      sku: productVariants.sku,
      priceCents: productVariants.priceCents,
      productId: products.id,
      productSlug: products.slug,
      productName: products.name,
      colorName: colors.name,
      sizeLabel: sizes.label,
    })
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .innerJoin(colors, eq(colors.id, productVariants.colorId))
    .innerJoin(sizes, eq(sizes.id, productVariants.sizeId))
    .where(inArray(productVariants.id, variantIds));
  if (rows.length !== variantIds.length) return { ok: false, message: "Una de las prendas ya no existe. Recarga la página." };
  const byId = new Map(rows.map((r) => [r.id, r]));
  const promotions = await activePromotionsByProduct(db, [...new Set(rows.map((r) => r.productId))], new Date());
  const pricing = priceLines(
    variantIds.map((id) => ({ variantId: id, quantity: quantities.get(id)!, unitPriceCents: byId.get(id)!.priceCents, promotion: promotions.get(byId.get(id)!.productId) ?? null })),
  );
  const total = saleTotal({ itemsTotalCents: pricing.totalCents, manualDiscountCents: input.manualDiscountCents, shippingCents: input.shippingCents });
  if (!total.ok) return total;
  const settled = settlePayments(total.totalCents, input.payments);
  if (!settled.ok) return settled;

  const [warehouse] = await db.select({ name: warehouses.name, sellsOnline: warehouses.sellsOnline }).from(warehouses).where(eq(warehouses.id, input.warehouseId));
  if (!warehouse) return { ok: false, message: "Esa tienda no existe." };
  const customer = input.customer?.documentNumber || input.customer?.name ? input.customer : null;

  try {
    return await db.transaction(async (tx) => {
      const [session] = await tx
        .select({ id: cashSessions.id })
        .from(cashSessions)
        .where(and(eq(cashSessions.warehouseId, input.warehouseId), isNull(cashSessions.closedAt)))
        .for("share");
      if (!session) return { ok: false as const, message: "La caja de esta tienda está cerrada. Ábrela para vender." };

      const { series, number } = await takeNumber(tx, input.warehouseId, input.documentType);
      const [sale] = await tx
        .insert(posSales)
        .values({
          documentType: input.documentType,
          series,
          number,
          warehouseId: input.warehouseId,
          cashSessionId: session.id,
          sellerId,
          customerDocumentType: customer?.documentNumber ? customer.documentType : null,
          customerDocumentNumber: customer?.documentNumber || null,
          customerName: customer?.name || null,
          subtotalCents: pricing.subtotalCents,
          promoDiscountCents: pricing.discountCents,
          manualDiscountCents: input.manualDiscountCents,
          shippingCents: input.shippingCents,
          totalCents: total.totalCents,
          changeCents: settled.changeCents,
          note: input.note?.trim() || null,
        })
        .returning({ id: posSales.id });
      await tx.insert(posSaleItems).values(
        pricing.lines.map((line) => {
          const v = byId.get(line.variantId)!;
          const promotion = promotions.get(v.productId);
          return {
            saleId: sale.id,
            variantId: v.id,
            productId: v.productId,
            sku: v.sku,
            productName: v.productName,
            colorName: v.colorName,
            sizeLabel: v.sizeLabel,
            unitPriceCents: v.priceCents,
            quantity: quantities.get(v.id)!,
            discountCents: line.discountCents,
            totalCents: line.totalCents,
            promotionName: line.discountCents > 0 && promotion ? promotion.name : null,
          };
        }),
      );
      await tx.insert(posPayments).values(
        input.payments.map((p) => ({
          saleId: sale.id,
          method: p.method,
          amountCents: p.amountCents,
          receivedCents: p.method === "efectivo" ? (p.receivedCents ?? p.amountCents) : null,
          reference: p.reference?.trim() || null,
        })),
      );
      const balances = await moveStock(
        tx,
        variantIds.map((id) => ({ variantId: id, warehouseId: input.warehouseId, quantity: -quantities.get(id)! })),
        { type: "venta_tienda", posSaleId: sale.id, userId: sellerId },
      );
      return {
        ok: true as const,
        saleId: sale.id,
        series,
        number,
        totalCents: total.totalCents,
        changeCents: settled.changeCents,
        // Si vende del stock de la web, la tienda online tiene que mostrar lo que queda (como un pedido web).
        productSlugs: warehouse.sellsOnline ? [...new Set(rows.map((r) => r.productSlug))] : [],
        soldOut: warehouse.sellsOnline && balances.some((b) => b.quantity === 0),
      };
    });
  } catch (error) {
    if (!(error instanceof InsufficientStockError)) throw error;
    const sku = byId.get(error.variantId)?.sku ?? "una prenda";
    return { ok: false, message: `No hay stock de ${sku} en ${warehouse.name}. Revisa el inventario.`, variantId: error.variantId };
  }
}

/** Anula una venta de la caja abierta: el stock vuelve a la tienda y sale de los totales de la caja. */
export async function voidSale(db: Db, input: { saleId: string; reason: string; userId: string | null }): Promise<{ ok: true; productSlugs: string[] } | Fail> {
  const reason = input.reason.trim();
  if (reason.length < 3) return { ok: false, message: "Escribe por qué se anula." };
  return db.transaction(async (tx) => {
    const [sale] = await tx.select().from(posSales).where(eq(posSales.id, input.saleId)).for("update");
    if (!sale) return { ok: false as const, message: "La venta no existe." };
    if (sale.status === "anulada") return { ok: false as const, message: "La venta ya está anulada." };
    const [session] = await tx.select({ closedAt: cashSessions.closedAt }).from(cashSessions).where(eq(cashSessions.id, sale.cashSessionId)).for("share");
    if (session?.closedAt) return { ok: false as const, message: "La caja de esa venta ya se cerró: el cambio o la devolución se registra como una venta nueva o una salida de caja." };

    const items = await tx.select({ variantId: posSaleItems.variantId, quantity: posSaleItems.quantity }).from(posSaleItems).where(eq(posSaleItems.saleId, sale.id));
    const back = items.filter((i): i is { variantId: string; quantity: number } => !!i.variantId);
    await moveStock(
      tx,
      back.map((i) => ({ variantId: i.variantId, warehouseId: sale.warehouseId, quantity: i.quantity })),
      { type: "anulacion_tienda", posSaleId: sale.id, userId: input.userId, note: reason },
    );
    await tx.update(posSales).set({ status: "anulada", voidedAt: new Date(), voidedBy: input.userId, voidReason: reason }).where(eq(posSales.id, sale.id));

    const [warehouse] = await tx.select({ sellsOnline: warehouses.sellsOnline }).from(warehouses).where(eq(warehouses.id, sale.warehouseId));
    const slugs =
      warehouse?.sellsOnline && back.length
        ? await tx
            .selectDistinct({ slug: products.slug })
            .from(productVariants)
            .innerJoin(products, eq(products.id, productVariants.productId))
            .where(inArray(productVariants.id, back.map((i) => i.variantId)))
        : [];
    return { ok: true as const, productSlugs: slugs.map((s) => s.slug) };
  });
}

// ─── Lectura ─────────────────────────────────────────────────────────────────

export const POS_SALES_PAGE_SIZE = 40;
const SALES_ID = sql.raw(`"pos_sales"."id"`);
const seller = alias(users, "seller");

export async function listPosSales(db: Db, { q, sessionId, page = 1 }: { q?: string; sessionId?: string; page?: number } = {}) {
  const conditions: SQL[] = [];
  if (sessionId) conditions.push(eq(posSales.cashSessionId, sessionId));
  if (q?.trim()) {
    const term = q.trim();
    const like = `%${term}%`;
    const [series, num] = term.toUpperCase().split("-");
    conditions.push(
      or(
        ilike(posSales.customerName, like),
        ilike(posSales.customerDocumentNumber, like),
        num && /^\d+$/.test(num) ? and(eq(posSales.series, series), eq(posSales.number, Number(num))) : undefined,
      )!,
    );
  }
  const where = conditions.length ? and(...conditions) : undefined;
  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: posSales.id,
        documentType: posSales.documentType,
        series: posSales.series,
        number: posSales.number,
        createdAt: posSales.createdAt,
        customerName: posSales.customerName,
        customerDocumentNumber: posSales.customerDocumentNumber,
        totalCents: posSales.totalCents,
        status: posSales.status,
        sellerName: seller.name,
        warehouseCode: warehouses.code,
        methods: sql<string>`(select string_agg(distinct p.method::text, ',') from ${posPayments} p where p.sale_id = ${SALES_ID})`,
        units: sql<number>`(select coalesce(sum(i.quantity), 0)::int from ${posSaleItems} i where i.sale_id = ${SALES_ID})`,
      })
      .from(posSales)
      .innerJoin(warehouses, eq(warehouses.id, posSales.warehouseId))
      .leftJoin(seller, eq(seller.id, posSales.sellerId))
      .where(where)
      .orderBy(desc(posSales.createdAt))
      .limit(POS_SALES_PAGE_SIZE)
      .offset((page - 1) * POS_SALES_PAGE_SIZE),
    db.select({ total: sql<number>`count(*)::int` }).from(posSales).where(where),
  ]);
  return { rows, total, page, pageCount: Math.max(1, Math.ceil(total / POS_SALES_PAGE_SIZE)) };
}

const voidedBy = alias(users, "voided_by");

export async function getPosSale(db: Db, id: string) {
  const [sale] = await db
    .select({
      sale: posSales,
      warehouseName: warehouses.name,
      warehouseAddress: warehouses.address,
      sellerName: seller.name,
      voidedByName: voidedBy.name,
      sessionNumber: cashSessions.number,
      sessionClosedAt: cashSessions.closedAt,
    })
    .from(posSales)
    .innerJoin(warehouses, eq(warehouses.id, posSales.warehouseId))
    .innerJoin(cashSessions, eq(cashSessions.id, posSales.cashSessionId))
    .leftJoin(seller, eq(seller.id, posSales.sellerId))
    .leftJoin(voidedBy, eq(voidedBy.id, posSales.voidedBy))
    .where(eq(posSales.id, id))
    .limit(1);
  if (!sale) return null;
  const [items, payments] = await Promise.all([
    db.select().from(posSaleItems).where(eq(posSaleItems.saleId, id)).orderBy(asc(posSaleItems.productName), asc(posSaleItems.sku)),
    db.select().from(posPayments).where(eq(posPayments.saleId, id)),
  ]);
  return { ...sale.sale, warehouseName: sale.warehouseName, warehouseAddress: sale.warehouseAddress, sellerName: sale.sellerName, voidedByName: sale.voidedByName, sessionNumber: sale.sessionNumber, sessionClosedAt: sale.sessionClosedAt, items, payments };
}
export type PosSaleDetail = NonNullable<Awaited<ReturnType<typeof getPosSale>>>;

/** Nombre del cliente por su DNI o RUC: de una venta anterior en tienda o de un pedido de la web. */
export async function findCustomerByDocument(db: Db, documentNumber: string) {
  const doc = documentNumber.trim();
  if (doc.length < 8) return null;
  const [fromStore] = await db
    .select({ documentType: posSales.customerDocumentType, name: posSales.customerName })
    .from(posSales)
    .where(and(eq(posSales.customerDocumentNumber, doc), sql`${posSales.customerName} is not null`))
    .orderBy(desc(posSales.createdAt))
    .limit(1);
  if (fromStore?.name) return fromStore;
  const [fromWeb] = await db.select({ documentType: customers.documentType, name: customers.name }).from(customers).where(eq(customers.documentNumber, doc)).limit(1);
  return fromWeb ?? null;
}
