/**
 * El comprobante por correo al cliente (pedido de TWENTY, 26/11/2026).
 * - Punto de venta: opcional. Sale solo si la caja escribió el correo en la venta, o después desde la venta.
 * - Web: siempre, al correo del pedido, cuando se emite al pasar a «Entregado» (`order-receipts.ts`).
 *
 * Una boleta o factura se manda recién cuando SUNAT la acepta, con el PDF A4 de la API adjunto (y el enlace, por si el
 * adjunto no llega). Si quedó pendiente, sale cuando se acepta: después de la venta siguiente del POS, con
 * «Reintentar envío» o con el cron diario de SUNAT. La nota de venta no pasa por SUNAT: sale enseguida, con el detalle.
 *
 * La fecha del envío (`receipt_emailed_at` en la venta, `emailed_at` en el comprobante web) se marca antes de mandar,
 * así dos llamadas a la vez no lo mandan dos veces, y se vuelve atrás si Resend falla, así se reintenta solo.
 */
import { and, asc, eq, gte, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import { formatPrice } from "@/lib/money";
import { formatOrderNumber } from "@/lib/order-status";
import { formatDocNumber, garmentOptions, POS_DOCUMENT_LABEL, type PosDocumentType } from "@/lib/pos";
import type { Db } from "../db/client";
import { orderReceipts, orders, posSales, productImages, productVariants } from "../db/schema";
import { getSiteSettings } from "./content";
import { sendEmail, type EmailAttachment } from "./email";
import { emailBrand, renderBrandedEmail, type EmailBlock, type EmailContent, type EmailItem } from "./email-layout";
import { getOrderReceipt, type OrderReceipt } from "./order-receipts";
import { getPosSale, type PosSaleDetail } from "./pos";

// ─── El correo ───────────────────────────────────────────────────────────────

export type ReceiptDocument = {
  documentType: PosDocumentType;
  series: string;
  number: number;
  /** De qué es: "tu compra del 26/11/2026 en TWENTY Tienda Gamarra" o "tu pedido #1001 en la web de TWENTY". */
  purchase: string;
  items: EmailItem[];
  totals: Extract<EmailBlock, { type: "totals" }>["rows"];
  /** PDF A4 de SUNAT (boleta o factura aceptada). */
  pdfUrl: string | null;
};

const KIND: Record<PosDocumentType, string> = { boleta: "boleta electrónica", factura: "factura electrónica", nota_venta: "nota de venta" };
const limaDate = new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", day: "2-digit", month: "2-digit", year: "numeric" });

export function receiptEmail(doc: ReceiptDocument): { subject: string; content: EmailContent } {
  const label = POS_DOCUMENT_LABEL[doc.documentType];
  const number = formatDocNumber(doc.series, doc.number);
  const kind = KIND[doc.documentType];
  const total = doc.totals.find((row) => row.strong)?.value ?? "";
  const blocks: EmailBlock[] = [{ type: "text", text: `Te enviamos la ${kind} de ${doc.purchase}.` }];
  if (doc.pdfUrl) {
    blocks.push(
      { type: "button", label: `Ver ${label.toLowerCase()} (PDF)`, url: doc.pdfUrl },
      { type: "text", text: "También va adjunta. Es la representación impresa del comprobante electrónico que aceptó SUNAT.", small: true, muted: true },
    );
  }
  blocks.push({ type: "box", title: "Detalle", blocks: [{ type: "items", items: doc.items }, { type: "totals", rows: doc.totals }] });
  return {
    subject: `Tu ${label.toLowerCase()} ${number} de TWENTY`,
    content: {
      preheader: `${kind[0].toUpperCase()}${kind.slice(1)} ${number}${total ? ` por ${total}` : ""}.`,
      eyebrow: `${label} ${number}`,
      title: "Gracias por tu compra",
      blocks,
    },
  };
}

/** "Negro · Talla 30 · x2" (sin el color ni la talla de una prenda por modelo). */
export function garmentDetail(colorName: string, sizeLabel: string, quantity: number): string {
  return [...garmentOptions(colorName, sizeLabel).map((o) => o.replace(/^T /, "Talla ")), `x${quantity}`].join(" · ");
}

/** El PDF del comprobante para adjuntarlo. Si la API no responde, el correo sale igual con el enlace. */
async function pdfAttachment(url: string | null, filename: string): Promise<EmailAttachment[]> {
  if (!url) return [];
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`la API respondió ${res.status}`);
    return [{ filename, content: Buffer.from(await res.arrayBuffer()), contentType: "application/pdf" }];
  } catch (error) {
    console.warn("[email] comprobante sin adjunto:", error instanceof Error ? error.message : error);
    return [];
  }
}

/** La primera foto del color de cada prenda (o del producto, si ese color no tiene). */
async function variantImages(db: Db, variantIds: string[]): Promise<Map<string, string>> {
  if (!variantIds.length) return new Map();
  const rows = await db
    .select({
      id: productVariants.id,
      image: sql<string | null>`(select pi.path from ${productImages} pi where pi.product_id = "product_variants"."product_id"
        order by (pi.color_id is not distinct from "product_variants"."color_id") desc, pi.position limit 1)`,
    })
    .from(productVariants)
    .where(inArray(productVariants.id, variantIds));
  return new Map(rows.flatMap((r) => (r.image ? [[r.id, r.image] as const] : [])));
}

type Garment = { variantId: string | null; productName: string; colorName: string; sizeLabel: string; quantity: number; totalCents: number };

const garmentItems = (items: Garment[], images: Map<string, string>): EmailItem[] =>
  items.map((i) => ({
    name: i.productName,
    detail: garmentDetail(i.colorName, i.sizeLabel, i.quantity),
    price: formatPrice(i.totalCents),
    image: (i.variantId && images.get(i.variantId)) || null,
  }));

/**
 * Arma y manda el correo. `key`: base de la clave de Resend; cada envío lleva su marca de tiempo (`at`), así un
 * reintento del mismo envío no se repite y un reenvío pedido sí sale. Devuelve false si los correos no están
 * configurados.
 */
async function deliver(
  db: Db,
  input: { to: string; garments: Garment[]; build: (items: EmailItem[]) => ReceiptDocument; key: string; at: Date; baseUrl: string },
): Promise<boolean> {
  const variantIds = input.garments.flatMap((g) => (g.variantId ? [g.variantId] : []));
  const [settings, images] = await Promise.all([getSiteSettings(db), variantImages(db, variantIds)]);
  const doc = input.build(garmentItems(input.garments, images));
  const filename = `${POS_DOCUMENT_LABEL[doc.documentType].toLowerCase().replace(/ /g, "-")}-${formatDocNumber(doc.series, doc.number)}.pdf`;
  const email = receiptEmail(doc);
  const { sent } = await sendEmail({
    tag: `comprobante-${doc.documentType}`,
    to: input.to,
    subject: email.subject,
    ...renderBrandedEmail(email.content, emailBrand(settings, input.baseUrl)),
    replyTo: settings.contact.email || settings.company.notificationEmail || undefined,
    attachments: await pdfAttachment(doc.pdfUrl, filename),
    idempotencyKey: `${input.key}-${input.at.getTime()}`,
  });
  return sent;
}

export type ReceiptEmailResult = "sent" | "waiting" | "skipped";

/** Solo los de la última semana: uno viejo al que se le pone el correo se manda a mano, no solo. */
const AUTO_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const recent = () => new Date(Date.now() - AUTO_WINDOW_MS);

// ─── Punto de venta ──────────────────────────────────────────────────────────

function saleDocument(sale: PosSaleDetail, items: EmailItem[]): ReceiptDocument {
  return {
    documentType: sale.documentType as PosDocumentType,
    series: sale.series,
    number: sale.number,
    purchase: `tu compra del ${limaDate.format(sale.createdAt)} en TWENTY ${sale.warehouseName}`,
    items,
    totals: [
      { label: "Subtotal", value: formatPrice(sale.subtotalCents) },
      ...(sale.promoDiscountCents ? [{ label: "Promociones", value: `-${formatPrice(sale.promoDiscountCents)}`, accent: true }] : []),
      ...(sale.manualDiscountCents ? [{ label: "Descuento", value: `-${formatPrice(sale.manualDiscountCents)}`, accent: true }] : []),
      ...(sale.shippingCents ? [{ label: "Envío", value: formatPrice(sale.shippingCents) }] : []),
      { label: "Total", value: formatPrice(sale.totalCents), strong: true },
    ],
    pdfUrl: sale.documentType === "nota_venta" ? null : sale.sunatPdfUrl,
  };
}

/**
 * Manda el comprobante de una venta a su correo. "waiting": la boleta o factura todavía no está aceptada (sale cuando
 * lo esté). `force`: vuelve a mandarlo aunque ya haya salido (desde la venta, también a otro correo).
 */
export async function emailSaleReceipt(db: Db, saleId: string, baseUrl: string, { force = false } = {}): Promise<ReceiptEmailResult> {
  const sale = await getPosSale(db, saleId);
  if (!sale?.customerEmail || sale.status !== "pagada") return "skipped";
  if (sale.documentType !== "nota_venta" && (sale.sunatStatus !== "aceptado" || !sale.sunatPdfUrl)) return "waiting";
  const [claimed] = await db
    .update(posSales)
    .set({ receiptEmailedAt: new Date() })
    .where(and(eq(posSales.id, saleId), force ? undefined : isNull(posSales.receiptEmailedAt)))
    .returning({ at: posSales.receiptEmailedAt });
  if (!claimed?.at) return "skipped";
  const release = () => db.update(posSales).set({ receiptEmailedAt: sale.receiptEmailedAt }).where(eq(posSales.id, saleId));
  try {
    const sent = await deliver(db, {
      to: sale.customerEmail,
      garments: sale.items,
      build: (items) => saleDocument(sale, items),
      key: `venta-${sale.id}-comprobante`,
      at: claimed.at,
      baseUrl,
    });
    if (sent) return "sent";
    await release();
    return "skipped";
  } catch (error) {
    await release();
    throw error;
  }
}

/** Las ventas con correo cuyo comprobante ya se puede mandar y todavía no salió (las de la última semana). */
export async function emailPendingSaleReceipts(db: Db, baseUrl: string, { limit = 10 }: { limit?: number } = {}) {
  const rows = await db
    .select({ id: posSales.id })
    .from(posSales)
    .where(
      and(
        isNotNull(posSales.customerEmail),
        isNull(posSales.receiptEmailedAt),
        eq(posSales.status, "pagada"),
        or(eq(posSales.documentType, "nota_venta"), eq(posSales.sunatStatus, "aceptado")),
        gte(posSales.createdAt, recent()),
      ),
    )
    .orderBy(asc(posSales.createdAt))
    .limit(limit);
  return sendEach(
    rows.map((r) => () => emailSaleReceipt(db, r.id, baseUrl)),
  );
}

/** El correo de una venta, puesto después (desde la venta): se guarda y, si ya se puede, se manda. */
export async function setSaleEmail(db: Db, saleId: string, email: string, baseUrl: string): Promise<ReceiptEmailResult | "not_found"> {
  const [updated] = await db.update(posSales).set({ customerEmail: email }).where(eq(posSales.id, saleId)).returning({ id: posSales.id });
  if (!updated) return "not_found";
  return emailSaleReceipt(db, saleId, baseUrl, { force: true });
}

// ─── Pedidos de la web ───────────────────────────────────────────────────────

function orderDocument(receipt: OrderReceipt, orderNumber: number, items: EmailItem[]): ReceiptDocument {
  const subtotal = receipt.items.reduce((sum, i) => sum + i.totalCents, 0);
  return {
    documentType: receipt.documentType as PosDocumentType,
    series: receipt.series,
    number: receipt.number,
    purchase: `tu pedido ${formatOrderNumber(orderNumber)} en la web de TWENTY`,
    items,
    totals: [
      { label: "Subtotal", value: formatPrice(subtotal) },
      ...(receipt.discountCents ? [{ label: "Descuentos", value: `-${formatPrice(receipt.discountCents)}`, accent: true }] : []),
      ...(receipt.shippingCents ? [{ label: "Envío", value: formatPrice(receipt.shippingCents) }] : []),
      { label: "Total", value: formatPrice(receipt.totalCents), strong: true },
    ],
    pdfUrl: receipt.documentType === "nota_venta" ? null : receipt.sunatPdfUrl,
  };
}

/**
 * Manda el comprobante al correo del pedido (solo si está entregado).
 * `force`: lo vuelve a mandar aunque ya haya salido (desde el panel).
 */
export async function emailOrderReceipt(db: Db, orderId: string, baseUrl: string, { force = false } = {}): Promise<ReceiptEmailResult> {
  const [receipt, [order]] = await Promise.all([
    getOrderReceipt(db, orderId),
    db.select({ email: orders.email, number: orders.number, status: orders.status }).from(orders).where(eq(orders.id, orderId)).limit(1),
  ]);
  if (!receipt || !order?.email || order.status !== "entregado") return "skipped";
  if (receipt.documentType !== "nota_venta" && (receipt.sunatStatus !== "aceptado" || !receipt.sunatPdfUrl)) return "waiting";
  const [claimed] = await db
    .update(orderReceipts)
    .set({ emailedAt: new Date() })
    .where(and(eq(orderReceipts.id, receipt.id), force ? undefined : isNull(orderReceipts.emailedAt)))
    .returning({ at: orderReceipts.emailedAt });
  if (!claimed?.at) return "skipped";
  const release = () => db.update(orderReceipts).set({ emailedAt: receipt.emailedAt }).where(eq(orderReceipts.id, receipt.id));
  try {
    const sent = await deliver(db, {
      to: order.email,
      garments: receipt.items,
      build: (items) => orderDocument(receipt, order.number, items),
      key: `pedido-${orderId}-comprobante`,
      at: claimed.at,
      baseUrl,
    });
    if (sent) return "sent";
    await release();
    return "skipped";
  } catch (error) {
    await release();
    throw error;
  }
}

/** Los comprobantes de pedidos entregados que ya se pueden mandar y todavía no salieron (los de la última semana). */
export async function emailPendingOrderReceipts(db: Db, baseUrl: string, { limit = 10 }: { limit?: number } = {}) {
  const rows = await db
    .select({ orderId: orderReceipts.orderId })
    .from(orderReceipts)
    .innerJoin(orders, eq(orders.id, orderReceipts.orderId))
    .where(
      and(
        isNull(orderReceipts.emailedAt),
        eq(orders.status, "entregado"),
        or(eq(orderReceipts.documentType, "nota_venta"), eq(orderReceipts.sunatStatus, "aceptado")),
        gte(orderReceipts.createdAt, recent()),
      ),
    )
    .orderBy(asc(orderReceipts.createdAt))
    .limit(limit);
  return sendEach(
    rows.map((r) => () => emailOrderReceipt(db, r.orderId, baseUrl)),
  );
}

/** Uno tras otro (el límite de Resend por segundo); si uno falla queda en el log y siguen los demás. */
async function sendEach(tasks: (() => Promise<ReceiptEmailResult>)[]) {
  let sent = 0;
  for (const task of tasks) {
    try {
      if ((await task()) === "sent") sent++;
    } catch (error) {
      console.error("[email] comprobante:", error instanceof Error ? error.message : error);
    }
  }
  return { checked: tasks.length, sent };
}
