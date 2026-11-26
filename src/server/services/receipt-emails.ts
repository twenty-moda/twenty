/**
 * El comprobante por correo al cliente (pedido de TWENTY, 26/11/2026). En el punto de venta es opcional: sale solo si
 * la caja escribió el correo en la venta, o después desde la venta.
 *
 * Una boleta o factura se manda recién cuando SUNAT la acepta, con el PDF A4 de la API adjunto (y el enlace, por si el
 * adjunto no llega). Si quedó pendiente, sale cuando se acepta: después de la venta siguiente, con «Reintentar envío» o
 * con el cron diario de SUNAT. La nota de venta no pasa por SUNAT: sale enseguida, con el detalle en el correo.
 *
 * `receipt_emailed_at` se marca antes de mandar (dos llamadas a la vez no lo mandan dos veces) y se vuelve atrás si
 * Resend falla, así se reintenta solo.
 */
import { and, asc, eq, gte, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import { formatPrice } from "@/lib/money";
import { formatDocNumber, garmentOptions, POS_DOCUMENT_LABEL, type PosDocumentType } from "@/lib/pos";
import type { Db } from "../db/client";
import { posSales, productImages, productVariants } from "../db/schema";
import { getSiteSettings } from "./content";
import { sendEmail, type EmailAttachment } from "./email";
import { emailBrand, renderBrandedEmail, type EmailBlock, type EmailContent, type EmailItem } from "./email-layout";
import { getPosSale, type PosSaleDetail } from "./pos";

// ─── El correo ───────────────────────────────────────────────────────────────

export type ReceiptDocument = {
  documentType: PosDocumentType;
  series: string;
  number: number;
  issuedAt: Date;
  /** Cómo se compró, después de la fecha: "en Tienda Gamarra" o "en la web (pedido #1001)". */
  origin: string;
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
  const blocks: EmailBlock[] = [{ type: "text", text: `Te enviamos la ${kind} de tu compra del ${limaDate.format(doc.issuedAt)} ${doc.origin}.` }];
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

// ─── Punto de venta ──────────────────────────────────────────────────────────

/** Solo las de la última semana: una venta vieja a la que se le pone el correo sale desde la venta, no sola. */
const AUTO_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

function saleDocument(sale: PosSaleDetail, images: Map<string, string>): ReceiptDocument {
  return {
    documentType: sale.documentType as PosDocumentType,
    series: sale.series,
    number: sale.number,
    issuedAt: sale.createdAt,
    origin: `en TWENTY ${sale.warehouseName}`,
    items: sale.items.map((i) => ({
      name: i.productName,
      detail: garmentDetail(i.colorName, i.sizeLabel, i.quantity),
      price: formatPrice(i.totalCents),
      image: (i.variantId && images.get(i.variantId)) || null,
    })),
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

export type ReceiptEmailResult = "sent" | "waiting" | "skipped";

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
  if (!claimed) return "skipped";
  const release = () => db.update(posSales).set({ receiptEmailedAt: sale.receiptEmailedAt }).where(eq(posSales.id, saleId));
  try {
    const label = POS_DOCUMENT_LABEL[sale.documentType].toLowerCase().replace(/ /g, "-");
    const [settings, images, attachments] = await Promise.all([
      getSiteSettings(db),
      variantImages(
        db,
        sale.items.flatMap((i) => (i.variantId ? [i.variantId] : [])),
      ),
      sale.documentType === "nota_venta" ? [] : pdfAttachment(sale.sunatPdfUrl, `${label}-${formatDocNumber(sale.series, sale.number)}.pdf`),
    ]);
    const email = receiptEmail(saleDocument(sale, images));
    const { sent } = await sendEmail({
      tag: `comprobante-${sale.documentType}`,
      to: sale.customerEmail,
      subject: email.subject,
      ...renderBrandedEmail(email.content, emailBrand(settings, baseUrl)),
      replyTo: settings.contact.email || settings.company.notificationEmail || undefined,
      attachments,
      // Cada envío tiene su marca de tiempo: un reintento del mismo envío no se repite, un reenvío pedido sí sale.
      idempotencyKey: `venta-${sale.id}-comprobante-${claimed.at!.getTime()}`,
    });
    if (!sent) {
      await release();
      return "skipped";
    }
    return "sent";
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
        gte(posSales.createdAt, new Date(Date.now() - AUTO_WINDOW_MS)),
      ),
    )
    .orderBy(asc(posSales.createdAt))
    .limit(limit);
  let sent = 0;
  for (const { id } of rows) {
    try {
      if ((await emailSaleReceipt(db, id, baseUrl)) === "sent") sent++;
    } catch (error) {
      console.error("[email] comprobante:", error instanceof Error ? error.message : error);
    }
  }
  return { checked: rows.length, sent };
}

/** El correo de una venta, puesto después (desde la venta): se guarda y, si ya se puede, se manda. */
export async function setSaleEmail(db: Db, saleId: string, email: string, baseUrl: string): Promise<ReceiptEmailResult | "not_found"> {
  const [updated] = await db.update(posSales).set({ customerEmail: email }).where(eq(posSales.id, saleId)).returning({ id: posSales.id });
  if (!updated) return "not_found";
  return emailSaleReceipt(db, saleId, baseUrl, { force: true });
}
