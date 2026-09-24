import { revalidateTag } from "next/cache";
import { connection } from "next/server";
import { cacheTags } from "@/lib/cache-tags";
import { getDb } from "@/server/db/client";
import { expireUnpaidCardOrders } from "@/server/services/orders";

/** Vercel Cron (vercel.json) llama aquí con `Authorization: Bearer <CRON_SECRET>`. */
export async function GET(request: Request) {
  await connection();
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return new Response("No autorizado", { status: 401 });

  const result = await expireUnpaidCardOrders(getDb());
  for (const slug of result.productSlugs) revalidateTag(cacheTags.product(slug), "max");
  if (result.productSlugs.length) revalidateTag(cacheTags.catalog, "max");
  return Response.json({ anulados: result.numbers });
}
