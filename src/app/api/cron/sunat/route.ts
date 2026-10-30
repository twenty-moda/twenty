import { connection } from "next/server";
import { getDb } from "@/server/db/client";
import { retryPendingSunat } from "@/server/services/pos";
import { retryPendingReturns } from "@/server/services/pos-returns";
import { sunatFromEnv } from "@/server/services/sunat";

/**
 * Vercel Cron (vercel.json, una vez al día por el plan Hobby) con `Authorization: Bearer <CRON_SECRET>`: reenvía las
 * boletas, facturas y notas de crédito del punto de venta que quedaron pendientes. El POS también lo hace después de
 * cada venta.
 */
export async function GET(request: Request) {
  await connection();
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return new Response("No autorizado", { status: 401 });
  const db = getDb();
  const client = sunatFromEnv();
  // Primero las ventas: una nota de crédito va contra un comprobante ya aceptado.
  const sales = await retryPendingSunat(db, client, { limit: 50 });
  const returns = await retryPendingReturns(db, client, { limit: 50 });
  return Response.json({ sales, returns });
}
