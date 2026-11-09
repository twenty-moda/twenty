import { revalidateTag } from "next/cache";
import { connection } from "next/server";
import { cacheTags } from "@/lib/cache-tags";
import { getDb } from "@/server/db/client";
import { notifyAfterResponse } from "@/server/order-events";
import { isGithubCronRequest } from "@/server/services/github-actions-auth";
import { expireUnpaidOrders } from "@/server/services/orders";

/**
 * Vercel Cron (vercel.json, una vez al día: es lo que deja el plan Hobby) llama aquí con `Authorization: Bearer
 * <CRON_SECRET>`, y el workflow `expirar-pedidos.yml` de GitHub Actions cada 30 minutos con su token OIDC.
 */
export async function GET(request: Request) {
  await connection();
  const authorization = request.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  const fromVercel = !!secret && authorization === `Bearer ${secret}`;
  if (!fromVercel && !(await isGithubCronRequest(authorization, "expirar-pedidos.yml"))) return new Response("No autorizado", { status: 401 });

  const result = await expireUnpaidOrders(getDb());
  for (const slug of result.productSlugs) revalidateTag(cacheTags.product(slug), "max");
  if (result.productSlugs.length) revalidateTag(cacheTags.catalog, "max");
  notifyAfterResponse(...result.changes.map((change) => ({ type: "status" as const, change })));
  return Response.json({ anulados: result.numbers });
}
