import { connection } from "next/server";
import { getDb } from "@/server/db/client";
import { retryPendingSunat } from "@/server/services/pos";
import { sunatFromEnv } from "@/server/services/sunat";

/**
 * Vercel Cron (vercel.json, una vez al día por el plan Hobby) con `Authorization: Bearer <CRON_SECRET>`: reenvía las
 * boletas y facturas del punto de venta que quedaron pendientes. El POS también lo hace después de cada venta.
 */
export async function GET(request: Request) {
  await connection();
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return new Response("No autorizado", { status: 401 });
  return Response.json(await retryPendingSunat(getDb(), sunatFromEnv(), { limit: 50 }));
}
