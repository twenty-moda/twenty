import { z } from "zod";
import { getDb } from "@/server/db/client";
import { getPaymentProofImage } from "@/server/services/payment-proofs";

/** La captura que subió el cliente, para que la vea en su pedido. Solo con el id del pedido (no se adivina). */
export async function GET(_: Request, { params }: RouteContext<"/pedido/[id]/captura/[proofId]">) {
  const { id, proofId } = await params;
  if (!z.uuid().safeParse(id).success || !z.uuid().safeParse(proofId).success) return new Response("No encontrado", { status: 404 });
  const proof = await getPaymentProofImage(getDb(), proofId, id);
  if (!proof) return new Response("No encontrado", { status: 404 });
  return new Response(new Uint8Array(proof.image), {
    headers: { "Content-Type": proof.contentType, "Cache-Control": "private, max-age=86400", "X-Robots-Tag": "noindex" },
  });
}
