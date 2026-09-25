import { z } from "zod";
import { getDb } from "@/server/db/client";
import { getPaymentProofImage } from "@/server/services/payment-proofs";
import { getAdmin } from "../../_lib/auth";

/** Captura del pago de Yape/Plin que subió el cliente (solo para el equipo). */
export async function GET(_: Request, { params }: RouteContext<"/admin/comprobantes/[id]">) {
  if (!(await getAdmin())) return new Response("No autorizado", { status: 401 });
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return new Response("No encontrado", { status: 404 });
  const proof = await getPaymentProofImage(getDb(), id);
  if (!proof) return new Response("No encontrado", { status: 404 });
  return new Response(new Uint8Array(proof.image), {
    headers: {
      "Content-Type": proof.contentType,
      "Content-Disposition": `inline; filename="captura-pedido-${proof.orderNumber}.webp"`,
      "Cache-Control": "private, max-age=86400",
    },
  });
}
