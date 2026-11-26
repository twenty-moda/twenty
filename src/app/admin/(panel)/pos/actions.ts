"use server";

import { refresh, revalidateTag } from "next/cache";
import { after } from "next/server";
import { cacheTags } from "@/lib/cache-tags";
import { appUrl } from "@/lib/links";
import { canSellVirtual } from "@/lib/panel-access";
import { getDb } from "@/server/db/client";
import { findCustomerByDocument, getPosSale, openCashSession, registerSale, retryPendingSunat, saleInputSchema, sendToSunat, type PosSaleDetail } from "@/server/services/pos";
import { retryPendingReturns } from "@/server/services/pos-returns";
import { retryPendingOrderReceipts } from "@/server/services/order-receipts";
import { emailPendingOrderReceipts, emailPendingSaleReceipts } from "@/server/services/receipt-emails";
import { sunatFromEnv } from "@/server/services/sunat";
import { requireStaff } from "../../_lib/auth";
import { failure, form, success, type ActionState } from "../../_lib/action-state";

export async function openCashAction(warehouseId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireStaff();
  const openingCents = form.cents(fd, "opening") ?? 0;
  const result = await openCashSession(getDb(), { warehouseId, openingCents, userId: user.id });
  if (!result.ok) return failure(result.message);
  refresh();
  return success(`Caja #${result.number} abierta.`);
}

export type SaleActionResult = { ok: true; sale: PosSaleDetail } | { ok: false; message: string; variantId?: string };

export async function registerSaleAction(input: unknown): Promise<SaleActionResult> {
  const user = await requireStaff();
  const parsed = saleInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  // Sin SUNAT conectado, una boleta o factura quedaría pendiente días: solo nota de venta.
  if (parsed.data.documentType !== "nota_venta" && !sunatFromEnv()) return { ok: false, message: "SUNAT todavía no está conectado: por ahora, solo nota de venta." };
  const db = getDb();
  // Solo «Tienda y web» y el admin marcan ventas virtuales; las de «Solo tienda» siempre son de tienda.
  const result = await registerSale(db, { ...parsed.data, channel: canSellVirtual(user.role) ? parsed.data.channel : "tienda" }, user.id);
  if (!result.ok) return result;
  // Igual que un pedido web: las fichas muestran el stock nuevo y el catálogo, si algo se agotó.
  for (const slug of result.productSlugs) revalidateTag(cacheTags.product(slug), "max");
  if (result.soldOut) revalidateTag(cacheTags.catalog, "max");
  // Boleta o factura: sale a SUNAT ya mismo (la venta quedó guardada aunque SUNAT no responda).
  if (parsed.data.documentType !== "nota_venta") await sendToSunat(db, result.saleId, sunatFromEnv());
  // Después de responder: reintenta las que quedaron pendientes antes (si SUNAT estuvo caído un rato) y manda los
  // comprobantes por correo (el de esta venta, si la caja puso el correo, y los que SUNAT acaba de aceptar).
  after(async () => {
    await retryPendingSunat(getDb(), sunatFromEnv(), { limit: 5, skip: result.saleId });
    await retryPendingReturns(getDb(), sunatFromEnv(), { limit: 5 });
    // También los comprobantes de la web que quedaron pendientes.
    await retryPendingOrderReceipts(getDb(), sunatFromEnv(), { limit: 5 });
    await emailPendingSaleReceipts(getDb(), appUrl());
    await emailPendingOrderReceipts(getDb(), appUrl());
  });
  // El POS vuelve a leer el stock de la tienda para la venta siguiente.
  refresh();
  return { ok: true, sale: (await getPosSale(db, result.saleId))! };
}

/**
 * Nombre del cliente por su DNI o RUC: de una venta anterior o de un pedido de la web. Un DNI que no compró antes se
 * busca en el padrón de SUNAT (gratis; solo encuentra a quien tiene RUC).
 */
export async function findCustomerAction(documentNumber: string) {
  await requireStaff();
  const doc = documentNumber.trim();
  const known = await findCustomerByDocument(getDb(), doc);
  if (known?.name || !/^\d{8}$/.test(doc)) return known;
  const name = await sunatFromEnv()
    ?.lookupDni(doc)
    .catch(() => null);
  return name ? { documentType: "dni" as const, name, email: known?.email ?? null } : known;
}

/** Razón social y dirección por el RUC (padrón de SUNAT); si no, de una venta anterior. */
export async function lookupRucAction(ruc: string): Promise<{ name: string; address: string | null } | null> {
  await requireStaff();
  if (!/^\d{11}$/.test(ruc)) return null;
  const fromSunat = await sunatFromEnv()
    ?.lookupRuc(ruc)
    .catch(() => null);
  if (fromSunat) return fromSunat;
  const known = await findCustomerByDocument(getDb(), ruc);
  return known?.name ? { name: known.name, address: null } : null;
}

/** Reintenta el envío a SUNAT de una boleta o factura pendiente (misma Idempotency-Key: nunca sale otra). */
export async function retrySunatAction(saleId: string): Promise<SaleActionResult> {
  await requireStaff();
  const db = getDb();
  const sale = await getPosSale(db, saleId);
  if (!sale?.sunatStatus) return { ok: false, message: "Esa venta no lleva boleta ni factura." };
  const sent = await sendToSunat(db, saleId, sunatFromEnv());
  // Si ahora quedó aceptada y tiene correo, sale el comprobante.
  if (sent.status === "aceptado") after(() => emailPendingSaleReceipts(getDb(), appUrl()));
  refresh();
  return { ok: true, sale: (await getPosSale(db, saleId))! };
}
