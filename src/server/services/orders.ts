import { and, asc, desc, eq, gte, ilike, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { normalizePhone, type CheckoutInput } from "@/lib/checkout-schema";
import { canTransition, OPEN_STATUSES, PAID_STATUSES, RESTOCK_STATUSES, type OrderStatus } from "@/lib/order-status";
import { priceLines } from "@/lib/pricing";
import { shippingOptions, type ShippingKind } from "@/lib/shipping";
import type { Db } from "../db/client";
import { customers, orderItems, orders, orderStatusHistory, products, productVariants, users } from "../db/schema";
import { getVariantSnapshots } from "./cart";
import { getDistrict, listShippingMethods, toShippingInfo } from "./shipping";

/**
 * `orders.id` con el nombre de la tabla, para subconsultas sobre order_items. En un select de una sola tabla Drizzle
 * escribe las columnas sin tabla ("id"), y dentro de `from order_items` eso sería order_items.id.
 */
export const ORDERS_ID = sql.raw(`"orders"."id"`);

export type PlaceOrderResult =
  | { ok: true; orderId: string; number: number; totalCents: number; productSlugs: string[]; soldOut: boolean; shippingKind: ShippingKind }
  | { ok: false; code: "unavailable" | "out_of_stock"; variantIds: string[] }
  | { ok: false; code: "shipping" | "address" | "agency"; message: string };

class OutOfStockError extends Error {
  constructor(readonly variantId: string) {
    super("out_of_stock");
  }
}

/**
 * Crea el pedido. El precio, las promos y el envío se recalculan aquí (no se confía en el navegador), y el
 * stock se descuenta en la misma transacción con `stock = stock - n WHERE stock >= n`: si dos personas compran
 * la última unidad a la vez, solo una lo logra y la otra recibe "out_of_stock" sin que se venda de más.
 */
export async function placeOrder(db: Db, input: CheckoutInput): Promise<PlaceOrderResult> {
  const quantities = new Map<string, number>();
  for (const item of input.items) quantities.set(item.variantId, (quantities.get(item.variantId) ?? 0) + item.quantity);
  const variantIds = [...quantities.keys()].sort();

  const snapshots = await getVariantSnapshots(db, variantIds);
  const byId = new Map(snapshots.map((s) => [s.variantId, s]));
  const unavailable = variantIds.filter((id) => !byId.get(id)?.available);
  if (unavailable.length) return { ok: false, code: "unavailable", variantIds: unavailable };
  const short = variantIds.filter((id) => byId.get(id)!.stock < quantities.get(id)!);
  if (short.length) return { ok: false, code: "out_of_stock", variantIds: short };

  const methods = (await listShippingMethods(db)).map(toShippingInfo);
  const district = input.ubigeo ? await getDistrict(db, input.ubigeo) : null;
  const option = shippingOptions(methods, district).find((o) => o.slug === input.shippingMethod);
  if (!option) return { ok: false, code: "shipping", message: "Esa forma de entrega no está disponible para tu distrito." };
  // Delivery: dirección. Agencia (Shalom, Olva): la agencia de destino donde recoge.
  const isAgency = option.kind === "agency";
  if (option.needsAddress && !district) return { ok: false, code: "address", message: "Elige tu distrito." };
  if (option.kind === "lima_delivery" && !input.address) return { ok: false, code: "address", message: "Escribe la dirección de entrega." };
  if (isAgency && !input.agencyName) return { ok: false, code: "agency", message: "Escribe la agencia donde recogerás tu pedido." };

  const pricing = priceLines(
    variantIds.map((id) => ({
      variantId: id,
      quantity: quantities.get(id)!,
      unitPriceCents: byId.get(id)!.priceCents,
      promotion: byId.get(id)!.promotion,
    })),
  );
  const lineById = new Map(pricing.lines.map((l) => [l.variantId, l]));
  const totalCents = pricing.totalCents + option.priceCents;

  try {
    return await db.transaction(async (tx) => {
      const [customer] = await tx
        .insert(customers)
        .values({
          name: input.name,
          email: input.email,
          phone: input.phone,
          documentType: input.documentType,
          documentNumber: input.documentNumber,
        })
        .onConflictDoUpdate({
          target: customers.email,
          set: { name: input.name, phone: input.phone, documentType: input.documentType, documentNumber: input.documentNumber, updatedAt: new Date() },
        })
        .returning({ id: customers.id });

      let soldOut = false;
      for (const id of variantIds) {
        const qty = quantities.get(id)!;
        const updated = await tx
          .update(productVariants)
          .set({ stock: sql`${productVariants.stock} - ${qty}` })
          .where(and(eq(productVariants.id, id), eq(productVariants.isActive, true), gte(productVariants.stock, qty)))
          .returning({ stock: productVariants.stock });
        if (updated.length === 0) throw new OutOfStockError(id);
        if (updated[0].stock === 0) soldOut = true;
      }

      const [order] = await tx
        .insert(orders)
        .values({
          customerId: customer.id,
          status: "pendiente",
          customerName: input.name,
          email: input.email,
          phone: input.phone,
          documentType: input.documentType,
          documentNumber: input.documentNumber,
          invoiceType: input.invoiceType,
          ruc: input.invoiceType === "factura" ? input.ruc : null,
          businessName: input.invoiceType === "factura" ? input.businessName : null,
          shippingMethodId: option.id,
          shippingMethodName: option.name,
          shippingKind: option.kind,
          paymentOnDelivery: option.paymentOnDelivery,
          ubigeo: option.needsAddress ? district!.ubigeo : null,
          department: option.needsAddress ? district!.department : null,
          province: option.needsAddress ? district!.province : null,
          district: option.needsAddress ? district!.name : null,
          address: option.kind === "lima_delivery" ? input.address : null,
          addressReference: option.kind === "lima_delivery" ? input.addressReference : null,
          agencyName: isAgency ? input.agencyName : null,
          agencyId: isAgency ? (input.agencyId ?? null) : null,
          paymentMethod: input.paymentMethod,
          subtotalCents: pricing.subtotalCents,
          discountCents: pricing.discountCents,
          shippingCents: option.priceCents,
          totalCents,
          promotions: pricing.promotions
            .filter((p) => p.discountCents > 0)
            .map((p) => ({ id: p.id, name: p.name, quantity: p.quantity, bundlePriceCents: p.bundlePriceCents, discountCents: p.discountCents })),
          customerNote: input.note,
        })
        .returning({ id: orders.id, number: orders.number });

      const variantRows = await tx
        .select({ id: productVariants.id, sku: productVariants.sku, productId: productVariants.productId })
        .from(productVariants)
        .where(inArray(productVariants.id, variantIds));
      const variantInfo = new Map(variantRows.map((v) => [v.id, v]));

      await tx.insert(orderItems).values(
        variantIds.map((id) => {
          const s = byId.get(id)!;
          const line = lineById.get(id)!;
          return {
            orderId: order.id,
            variantId: id,
            productId: variantInfo.get(id)?.productId ?? null,
            productName: s.productName,
            productSlug: s.productSlug,
            sku: variantInfo.get(id)?.sku ?? "",
            colorName: s.colorName,
            sizeLabel: s.sizeLabel,
            image: s.image,
            unitPriceCents: s.priceCents,
            compareAtPriceCents: s.compareAtPriceCents,
            quantity: quantities.get(id)!,
            discountCents: line.discountCents,
            totalCents: line.totalCents,
          };
        }),
      );
      await tx.insert(orderStatusHistory).values({ orderId: order.id, toStatus: "pendiente", note: "Pedido creado en la web" });

      return {
        ok: true as const,
        orderId: order.id,
        number: order.number,
        totalCents,
        productSlugs: [...new Set(variantIds.map((id) => byId.get(id)!.productSlug))],
        soldOut,
        shippingKind: option.kind,
      };
    });
  } catch (error) {
    if (error instanceof OutOfStockError) return { ok: false, code: "out_of_stock", variantIds: [error.variantId] };
    throw error;
  }
}

// ─── Lectura ─────────────────────────────────────────────────────────────────

async function loadOrder(db: Db, where: ReturnType<typeof eq>) {
  const [order] = await db.select().from(orders).where(where).limit(1);
  if (!order) return null;
  const [items, history] = await Promise.all([
    db.select().from(orderItems).where(eq(orderItems.orderId, order.id)).orderBy(asc(orderItems.productName)),
    db
      .select({
        id: orderStatusHistory.id,
        fromStatus: orderStatusHistory.fromStatus,
        toStatus: orderStatusHistory.toStatus,
        note: orderStatusHistory.note,
        customerMessage: orderStatusHistory.customerMessage,
        createdAt: orderStatusHistory.createdAt,
        changedByName: users.name,
      })
      .from(orderStatusHistory)
      .leftJoin(users, eq(users.id, orderStatusHistory.changedBy))
      .where(eq(orderStatusHistory.orderId, order.id))
      .orderBy(asc(orderStatusHistory.createdAt)),
  ]);
  return { ...order, items, history };
}

export type OrderDetail = NonNullable<Awaited<ReturnType<typeof loadOrder>>>;

export function getOrderByNumber(db: Db, number: number) {
  return loadOrder(db, eq(orders.number, number));
}

/** Pedido completo (con notas internas): solo para el equipo y los emails. */
export function getOrderById(db: Db, id: string) {
  return loadOrder(db, eq(orders.id, id));
}

/** Vista del cliente (por el id no adivinable del enlace). Sin notas internas. */
export async function getOrderForCustomer(db: Db, id: string) {
  const order = await loadOrder(db, eq(orders.id, id));
  if (!order) return null;
  const { internalNote: _internal, history, ...rest } = order;
  return { ...rest, history: history.map(({ changedByName: _by, note: _note, ...h }) => h) };
}

/**
 * Rastreo público con solo el número de pedido. Como el número es correlativo (cualquiera puede probar otro), no
 * devuelve datos personales ni lo que sirva para retirar el pedido (dirección, agencia, mensajes con claves): solo
 * el estado, sus fechas y la forma de entrega. El detalle completo está en /pedido/[id] (enlace del email) o con
 * findOrderIdForTracking.
 */
export async function getOrderTracking(db: Db, number: number) {
  const [order] = await db
    .select({ id: orders.id, number: orders.number, status: orders.status, createdAt: orders.createdAt, shippingKind: orders.shippingKind, shippingMethodName: orders.shippingMethodName })
    .from(orders)
    .where(eq(orders.number, number))
    .limit(1);
  if (!order) return null;
  const history = await db
    .select({ status: orderStatusHistory.toStatus, at: orderStatusHistory.createdAt })
    .from(orderStatusHistory)
    .where(eq(orderStatusHistory.orderId, order.id))
    .orderBy(asc(orderStatusHistory.createdAt));
  const { id: _id, ...rest } = order;
  return { ...rest, history };
}

export type OrderTracking = NonNullable<Awaited<ReturnType<typeof getOrderTracking>>>;

/**
 * Detalle completo desde /tracking: además del número se pide el celular o el email de la compra.
 * Devuelve el id (no adivinable) para ir a /pedido/[id], o null si no coincide.
 */
export async function findOrderIdForTracking(db: Db, number: number, contact: string): Promise<string | null> {
  const [order] = await db.select({ id: orders.id, email: orders.email, phone: orders.phone }).from(orders).where(eq(orders.number, number)).limit(1);
  if (!order) return null;
  const value = contact.trim();
  const matches = value.includes("@") ? value.toLowerCase() === order.email.toLowerCase() : normalizePhone(value) === normalizePhone(order.phone);
  return matches ? order.id : null;
}

export type OrderListFilter = { status?: OrderStatus | "abiertos"; q?: string; page?: number; customerId?: string };
export const ORDERS_PAGE_SIZE = 25;

export async function listOrders(db: Db, filter: OrderListFilter = {}) {
  const conditions = [];
  if (filter.status === "abiertos") conditions.push(inArray(orders.status, OPEN_STATUSES));
  else if (filter.status) conditions.push(eq(orders.status, filter.status));
  if (filter.customerId) conditions.push(eq(orders.customerId, filter.customerId));
  const q = filter.q?.trim();
  if (q) {
    const number = Number(q.replace(/^#/, ""));
    const like = `%${q}%`;
    conditions.push(
      or(
        Number.isInteger(number) && number > 0 ? eq(orders.number, number) : undefined,
        ilike(orders.customerName, like),
        ilike(orders.email, like),
        ilike(orders.phone, like),
        ilike(orders.documentNumber, like),
      )!,
    );
  }
  const where = conditions.length ? and(...conditions) : undefined;
  const page = Math.max(1, filter.page ?? 1);

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: orders.id,
        number: orders.number,
        status: orders.status,
        customerName: orders.customerName,
        phone: orders.phone,
        totalCents: orders.totalCents,
        shippingMethodName: orders.shippingMethodName,
        district: orders.district,
        paymentMethod: orders.paymentMethod,
        createdAt: orders.createdAt,
        units: sql<number>`(select coalesce(sum(${orderItems.quantity}), 0)::int from ${orderItems} where ${orderItems.orderId} = ${ORDERS_ID})`,
      })
      .from(orders)
      .where(where)
      .orderBy(desc(orders.createdAt))
      .limit(ORDERS_PAGE_SIZE)
      .offset((page - 1) * ORDERS_PAGE_SIZE),
    db.select({ total: sql<number>`count(*)::int` }).from(orders).where(where),
  ]);
  return { rows, total, page, pageCount: Math.max(1, Math.ceil(total / ORDERS_PAGE_SIZE)) };
}

export async function countOrdersByStatus(db: Db) {
  const rows = await db.select({ status: orders.status, count: sql<number>`count(*)::int` }).from(orders).groupBy(orders.status);
  return Object.fromEntries(rows.map((r) => [r.status, r.count])) as Partial<Record<OrderStatus, number>>;
}

// ─── Cambios de estado ───────────────────────────────────────────────────────

/** Un cambio de estado ya guardado: con esto se decide qué emails salen (ver order-notifications.ts). */
export type StatusChange = {
  orderId: string;
  /** Fila del historial (sirve de clave para no mandar el mismo email dos veces). */
  historyId: string;
  from: OrderStatus;
  to: OrderStatus;
  changedBy: string | null;
  restocked: boolean;
  paymentMethod: (typeof orders.$inferSelect)["paymentMethod"];
};

export type ChangeStatusResult =
  | { ok: true; restocked: boolean; productSlugs: string[]; change: StatusChange }
  | { ok: false; message: string };

/** Cambia el estado con historial. Al anular o rechazar devuelve el stock (una sola vez). */
export async function changeOrderStatus(
  db: Db,
  input: { orderId: string; to: OrderStatus; note?: string | null; customerMessage?: string | null; userId: string | null },
): Promise<ChangeStatusResult> {
  return db.transaction(async (tx) => {
    const [order] = await tx.select().from(orders).where(eq(orders.id, input.orderId)).for("update").limit(1);
    if (!order) return { ok: false, message: "El pedido no existe." };
    if (!canTransition(order.status, input.to)) return { ok: false, message: "Ese cambio de estado no está permitido." };

    let restocked = false;
    let productSlugs: string[] = [];
    const now = new Date();
    if (RESTOCK_STATUSES.includes(input.to) && !order.stockRestoredAt) {
      const items = await tx
        .select({ variantId: orderItems.variantId, quantity: orderItems.quantity, productSlug: orderItems.productSlug })
        .from(orderItems)
        .where(eq(orderItems.orderId, order.id));
      for (const item of items) {
        if (!item.variantId) continue; // la variante se borró del catálogo
        await tx
          .update(productVariants)
          .set({ stock: sql`${productVariants.stock} + ${item.quantity}` })
          .where(eq(productVariants.id, item.variantId));
      }
      restocked = true;
      productSlugs = [...new Set(items.map((i) => i.productSlug))];
    }

    await tx
      .update(orders)
      .set({ status: input.to, updatedAt: now, ...(restocked ? { stockRestoredAt: now } : {}) })
      .where(eq(orders.id, order.id));
    const [history] = await tx
      .insert(orderStatusHistory)
      .values({
        orderId: order.id,
        fromStatus: order.status,
        toStatus: input.to,
        note: input.note?.trim() || null,
        customerMessage: input.customerMessage?.trim() || null,
        changedBy: input.userId,
      })
      .returning({ id: orderStatusHistory.id });
    return {
      ok: true,
      restocked,
      productSlugs,
      change: {
        orderId: order.id,
        historyId: history.id,
        from: order.status,
        to: input.to,
        changedBy: input.userId,
        restocked,
        paymentMethod: order.paymentMethod,
      },
    };
  });
}

/** Guía del courier para el seguimiento (Shalom: N° de orden y código). `null` la borra. */
export async function setOrderTracking(db: Db, orderId: string, tracking: { number: string; code: string } | null) {
  await db
    .update(orders)
    .set({ trackingNumber: tracking?.number ?? null, trackingCode: tracking?.code ?? null, updatedAt: new Date() })
    .where(eq(orders.id, orderId));
}

export async function updateInternalNote(db: Db, orderId: string, note: string | null) {
  await db.update(orders).set({ internalNote: note?.trim() || null }).where(eq(orders.id, orderId));
}

// ─── Resumen del admin ───────────────────────────────────────────────────────

/** Inicio del día en Lima (UTC-5, sin horario de verano). */
export function startOfLimaDay(now: Date): Date {
  const lima = new Date(now.getTime() - 5 * 60 * 60 * 1000);
  return new Date(Date.UTC(lima.getUTCFullYear(), lima.getUTCMonth(), lima.getUTCDate()) + 5 * 60 * 60 * 1000);
}

export async function getDashboard(db: Db, now = new Date()) {
  const today = startOfLimaDay(now);
  const last30 = new Date(today.getTime() - 29 * 24 * 60 * 60 * 1000);
  const paid = inArray(orders.status, PAID_STATUSES);

  const sales = (since: Date) =>
    db
      .select({ count: sql<number>`count(*)::int`, total: sql<number>`coalesce(sum(${orders.totalCents}), 0)::int` })
      .from(orders)
      .where(and(paid, gte(orders.createdAt, since)));

  const [[todayAll], [todayPaid], [monthPaid], byStatus, recent, lowStock] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` }).from(orders).where(gte(orders.createdAt, today)),
    sales(today),
    sales(last30),
    countOrdersByStatus(db),
    listOrders(db, { page: 1 }),
    db
      .select({
        variantId: productVariants.id,
        sku: productVariants.sku,
        stock: productVariants.stock,
        productId: products.id,
        productName: products.name,
      })
      .from(productVariants)
      .innerJoin(products, eq(products.id, productVariants.productId))
      .where(and(eq(productVariants.isActive, true), eq(products.status, "active"), lte(productVariants.stock, 1)))
      .orderBy(asc(productVariants.stock), asc(products.name))
      .limit(12),
  ]);

  return {
    ordersToday: todayAll.count,
    salesTodayCents: todayPaid.total,
    sales30Cents: monthPaid.total,
    orders30: monthPaid.count,
    byStatus,
    open: OPEN_STATUSES.reduce((sum, s) => sum + (byStatus[s] ?? 0), 0),
    recent: recent.rows.slice(0, 8),
    lowStock,
  };
}

// ─── Clientes ────────────────────────────────────────────────────────────────

export async function listCustomers(db: Db, { q, page = 1 }: { q?: string; page?: number } = {}) {
  const like = q?.trim() ? `%${q.trim()}%` : null;
  const where = like
    ? or(ilike(customers.name, like), ilike(customers.email, like), ilike(customers.phone, like), ilike(customers.documentNumber, like))
    : undefined;
  const paidOnly = sql`${orders.status} in (${sql.join(
    PAID_STATUSES.map((s) => sql`${s}`),
    sql`, `,
  )})`;
  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: customers.id,
        name: customers.name,
        email: customers.email,
        phone: customers.phone,
        createdAt: customers.createdAt,
        orders: sql<number>`count(${orders.id})::int`,
        spentCents: sql<number>`coalesce(sum(${orders.totalCents}) filter (where ${paidOnly}), 0)::int`,
        lastOrderAt: sql<Date | null>`max(${orders.createdAt})`,
      })
      .from(customers)
      .leftJoin(orders, eq(orders.customerId, customers.id))
      .where(where)
      .groupBy(customers.id)
      .orderBy(sql`max(${orders.createdAt}) desc nulls last`)
      .limit(ORDERS_PAGE_SIZE)
      .offset((Math.max(1, page) - 1) * ORDERS_PAGE_SIZE),
    db.select({ total: sql<number>`count(*)::int` }).from(customers).where(where),
  ]);
  return { rows, total, page, pageCount: Math.max(1, Math.ceil(total / ORDERS_PAGE_SIZE)) };
}

export async function getCustomer(db: Db, id: string) {
  const [customer] = await db.select().from(customers).where(eq(customers.id, id)).limit(1);
  if (!customer) return null;
  const orderList = await listOrders(db, { customerId: id });
  const [stats] = await db
    .select({
      spentCents: sql<number>`coalesce(sum(${orders.totalCents}), 0)::int`,
      paidOrders: sql<number>`count(*)::int`,
    })
    .from(orders)
    .where(and(eq(orders.customerId, id), inArray(orders.status, PAID_STATUSES)));
  return { ...customer, orders: orderList.rows, totalOrders: orderList.total, ...stats };
}

export async function updateCustomerNotes(db: Db, id: string, notes: string | null) {
  await db.update(customers).set({ notes: notes?.trim() || null }).where(eq(customers.id, id));
}

/** Minutos que un pedido con tarjeta puede esperar el pago antes de liberar su stock. */
export const CARD_PAYMENT_WINDOW_MINUTES = 60;

/**
 * Anula los pedidos con tarjeta que no se pagaron a tiempo y devuelve su stock (lo corre el cron).
 * Los de Yape con QR y WhatsApp no se anulan solos: el equipo decide, porque suelen pagar más tarde.
 */
export async function expireUnpaidCardOrders(db: Db, now = new Date()): Promise<{ numbers: number[]; productSlugs: string[]; changes: StatusChange[] }> {
  const before = new Date(now.getTime() - CARD_PAYMENT_WINDOW_MINUTES * 60 * 1000);
  const stale = await db
    .select({ id: orders.id, number: orders.number })
    .from(orders)
    .where(and(eq(orders.status, "pendiente"), eq(orders.paymentMethod, "tarjeta"), lte(orders.createdAt, before), isNull(orders.stockRestoredAt)));
  const numbers: number[] = [];
  const productSlugs = new Set<string>();
  const changes: StatusChange[] = [];
  for (const order of stale) {
    const result = await changeOrderStatus(db, {
      orderId: order.id,
      to: "anulado",
      note: `Anulado automáticamente: no se recibió el pago con tarjeta en ${CARD_PAYMENT_WINDOW_MINUTES} minutos.`,
      userId: null,
    });
    if (result.ok) {
      numbers.push(order.number);
      changes.push(result.change);
      for (const slug of result.productSlugs) productSlugs.add(slug);
    }
  }
  return { numbers, productSlugs: [...productSlugs], changes };
}
