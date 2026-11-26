"use server";

import { refresh, revalidateTag } from "next/cache";
import { z } from "zod";
import { cacheTags } from "@/lib/cache-tags";
import { appUrl } from "@/lib/links";
import { formatPrice } from "@/lib/money";
import { formatDocNumber, PAYMENT_LABEL } from "@/lib/pos";
import { getDb } from "@/server/db/client";
import { voidSale } from "@/server/services/pos";
import { registerReturn, returnInputSchema, sendReturnToSunat } from "@/server/services/pos-returns";
import { setSaleEmail } from "@/server/services/receipt-emails";
import { sunatFromEnv } from "@/server/services/sunat";
import { requireAdmin, requireStaff } from "../../_lib/auth";
import { failure, form, success, type ActionState } from "../../_lib/action-state";

const receiptEmailSchema = z.string().trim().toLowerCase().max(120).pipe(z.email("Revisa el correo"));

/** Manda (o vuelve a mandar) el comprobante de una venta a un correo; si la boleta sigue pendiente, sale al aceptarse. */
export async function sendSaleReceiptAction(saleId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  await requireStaff();
  const parsed = receiptEmailSchema.safeParse(form.text(fd, "email"));
  if (!parsed.success) return failure(parsed.error.issues[0].message, undefined, { email: form.text(fd, "email") });
  let result: Awaited<ReturnType<typeof setSaleEmail>>;
  try {
    result = await setSaleEmail(getDb(), saleId, parsed.data, appUrl());
  } catch (error) {
    console.error("[email] comprobante:", error instanceof Error ? error.message : error);
    return failure("No se pudo mandar el correo. Inténtalo otra vez en un rato.");
  }
  refresh();
  if (result === "not_found") return failure("Esa venta no existe.");
  if (result === "waiting") return success("Correo guardado: el comprobante le llega cuando SUNAT lo acepte.");
  if (result === "skipped") return failure("No se mandó: la venta está anulada o los correos de la tienda no están configurados.");
  return success(`Comprobante enviado a ${parsed.data}.`);
}

const revalidateProducts = (slugs: string[]) => {
  for (const slug of slugs) revalidateTag(cacheTags.product(slug), "max");
  if (slugs.length) revalidateTag(cacheTags.catalog, "max");
};

export async function voidSaleAction(saleId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  // Boleta o factura aceptada: primero se pide la baja a SUNAT.
  const result = await voidSale(getDb(), { saleId, reason: form.text(fd, "reason"), userId: admin.id }, sunatFromEnv());
  if (!result.ok) return failure(result.message);
  revalidateProducts(result.productSlugs);
  refresh();
  return success("Venta anulada: las prendas volvieron al stock de la tienda.");
}

/** Devolver prendas: vuelven al stock, el dinero sale de la caja abierta y, si fue boleta o factura, sale la nota de crédito. */
export async function registerReturnAction(saleId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  let items: unknown;
  try {
    items = JSON.parse(form.text(fd, "items") || "[]");
  } catch {
    items = [];
  }
  const parsed = returnInputSchema.safeParse({
    saleId,
    items,
    reason: form.text(fd, "reason"),
    refundMethod: form.text(fd, "refundMethod"),
    cashSessionId: form.optional(fd, "cashSessionId") ?? undefined,
  });
  if (!parsed.success) return failure(parsed.error.issues[0].message);
  const db = getDb();
  const result = await registerReturn(db, parsed.data, admin.id);
  if (!result.ok) return failure(result.message);
  revalidateProducts(result.productSlugs);
  let message = `Devolución registrada: se entregan ${formatPrice(result.refundCents)} por ${PAYMENT_LABEL[parsed.data.refundMethod]}.`;
  if (result.creditNote) {
    const sent = await sendReturnToSunat(db, result.returnId, sunatFromEnv());
    const number = formatDocNumber(result.creditNote.series, result.creditNote.number);
    message += sent.status === "aceptado" ? ` Nota de crédito ${number} aceptada por SUNAT.` : ` Nota de crédito ${number}: ${sent.message}`;
  }
  refresh();
  return success(message);
}

/** Reintenta la nota de crédito de una devolución (misma Idempotency-Key: nunca sale otra). */
export async function retryReturnSunatAction(returnId: string): Promise<{ ok: true } | { ok: false; message: string }> {
  await requireStaff();
  const sent = await sendReturnToSunat(getDb(), returnId, sunatFromEnv()).catch(() => null);
  if (!sent) return { ok: false, message: "Esa devolución no lleva nota de crédito." };
  refresh();
  return { ok: true };
}
