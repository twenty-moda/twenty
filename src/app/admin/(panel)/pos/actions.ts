"use server";

import { refresh, revalidateTag } from "next/cache";
import { cacheTags } from "@/lib/cache-tags";
import { getDb } from "@/server/db/client";
import { findCustomerByDocument, getPosSale, openCashSession, registerSale, saleInputSchema, sendToSunat, type PosSaleDetail } from "@/server/services/pos";
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
  const db = getDb();
  const result = await registerSale(db, parsed.data, user.id);
  if (!result.ok) return result;
  // Igual que un pedido web: las fichas muestran el stock nuevo y el catálogo, si algo se agotó.
  for (const slug of result.productSlugs) revalidateTag(cacheTags.product(slug), "max");
  if (result.soldOut) revalidateTag(cacheTags.catalog, "max");
  // Boleta o factura: sale a SUNAT ya mismo (la venta quedó guardada aunque SUNAT no responda).
  if (parsed.data.documentType !== "nota_venta") await sendToSunat(db, result.saleId, sunatFromEnv());
  // El POS vuelve a leer el stock de la tienda para la venta siguiente.
  refresh();
  return { ok: true, sale: (await getPosSale(db, result.saleId))! };
}

export async function findCustomerAction(documentNumber: string) {
  await requireStaff();
  return findCustomerByDocument(getDb(), documentNumber);
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
  await sendToSunat(db, saleId, sunatFromEnv());
  refresh();
  return { ok: true, sale: (await getPosSale(db, saleId))! };
}
