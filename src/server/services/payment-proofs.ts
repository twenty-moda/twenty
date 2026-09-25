/**
 * Capturas del pago con Yape/Plin. El cliente la sube en /pedido/[id] (el id no se adivina) y el pedido pasa a
 * "Pago por verificar"; el equipo la ve en el panel y lo confirma. Se guardan en la BD (ver payment_proofs).
 */
import { and, asc, count, eq, lte } from "drizzle-orm";
import sharp from "sharp";
import type { OrderStatus } from "@/lib/order-status";
import type { Db } from "../db/client";
import { orders, paymentProofs } from "../db/schema";
import { changeOrderStatus, type StatusChange } from "./orders";

/** Estados en los que el cliente todavía puede subir (o cambiar) la captura. */
export const PROOF_UPLOAD_STATUSES: OrderStatus[] = ["pendiente", "por_verificar"];
export const MAX_PROOFS_PER_ORDER = 5;
/** Una captura de pantalla se lee bien a este tamaño y pesa poco. */
const MAX_SIZE = 1400;

export class InvalidProofError extends Error {}

export async function processProofImage(input: ArrayBuffer | Buffer): Promise<{ image: Buffer; width: number; height: number }> {
  try {
    const { data, info } = await sharp(Buffer.from(input as ArrayBuffer))
      .rotate()
      .resize({ width: MAX_SIZE, height: MAX_SIZE, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer({ resolveWithObject: true });
    return { image: data, width: info.width, height: info.height };
  } catch {
    throw new InvalidProofError("El archivo no es una imagen. Sube la captura de pantalla del pago (JPG o PNG).");
  }
}

/** `change`: el paso a "por verificar" (solo con la primera captura). */
export type SubmitProofResult = { ok: true; proofId: string; change: StatusChange | null } | { ok: false; message: string };

export async function submitPaymentProof(db: Db, orderId: string, proof: { image: Buffer; width: number; height: number }): Promise<SubmitProofResult> {
  const [order] = await db
    .select({ id: orders.id, status: orders.status, paymentMethod: orders.paymentMethod })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);
  if (!order || order.paymentMethod !== "yape_plin") return { ok: false, message: "Este pedido no se paga con Yape o Plin." };
  if (!PROOF_UPLOAD_STATUSES.includes(order.status)) return { ok: false, message: "Este pedido ya no espera la captura del pago." };
  const [{ total }] = await db.select({ total: count() }).from(paymentProofs).where(eq(paymentProofs.orderId, orderId));
  if (total >= MAX_PROOFS_PER_ORDER) return { ok: false, message: "Ya recibimos varias capturas de este pedido. Si falta algo, escríbenos por WhatsApp." };

  const [saved] = await db
    .insert(paymentProofs)
    .values({ orderId, image: proof.image, contentType: "image/webp", width: proof.width, height: proof.height })
    .returning({ id: paymentProofs.id });
  if (order.status !== "pendiente") return { ok: true, proofId: saved.id, change: null };
  const result = await changeOrderStatus(db, { orderId, to: "por_verificar", note: "El cliente subió la captura del pago.", userId: null });
  // Si dos capturas llegan a la vez, la segunda ya encuentra el pedido en "por verificar": no es un error.
  return { ok: true, proofId: saved.id, change: result.ok ? result.change : null };
}

/** Capturas de un pedido, sin la imagen (para listarlas). */
export function listPaymentProofs(db: Db, orderId: string) {
  return db
    .select({ id: paymentProofs.id, width: paymentProofs.width, height: paymentProofs.height, createdAt: paymentProofs.createdAt })
    .from(paymentProofs)
    .where(eq(paymentProofs.orderId, orderId))
    .orderBy(asc(paymentProofs.createdAt));
}

/**
 * La captura para el email del equipo, en JPEG (Outlook de escritorio no muestra WebP), con cuántas lleva el pedido
 * hasta ella (la 2.ª suele ser una corrección de la 1.ª).
 */
export async function getPaymentProofForEmail(db: Db, proofId: string) {
  const [row] = await db
    .select({ orderId: paymentProofs.orderId, image: paymentProofs.image, createdAt: paymentProofs.createdAt })
    .from(paymentProofs)
    .where(eq(paymentProofs.id, proofId))
    .limit(1);
  if (!row) return null;
  const [{ nth }] = await db
    .select({ nth: count() })
    .from(paymentProofs)
    .where(and(eq(paymentProofs.orderId, row.orderId), lte(paymentProofs.createdAt, row.createdAt)));
  const jpeg = await sharp(row.image).flatten({ background: "#ffffff" }).jpeg({ quality: 82, mozjpeg: true }).toBuffer();
  return { orderId: row.orderId, jpeg, nth };
}

export async function getPaymentProofImage(db: Db, id: string, orderId?: string) {
  const [row] = await db
    .select({ image: paymentProofs.image, contentType: paymentProofs.contentType, orderNumber: orders.number })
    .from(paymentProofs)
    .innerJoin(orders, eq(orders.id, paymentProofs.orderId))
    .where(orderId ? and(eq(paymentProofs.id, id), eq(paymentProofs.orderId, orderId)) : eq(paymentProofs.id, id))
    .limit(1);
  return row ?? null;
}
