"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { getDb } from "@/server/db/client";
import { notifyAfterResponse } from "@/server/order-events";
import { InvalidProofError, processProofImage, submitPaymentProof } from "@/server/services/payment-proofs";
import { culqiFromEnv, payOrderWithCulqi, type PayResult } from "@/server/services/payments";
import { allowRequest } from "../../_lib/request";

const payInputSchema = z.object({
  orderId: z.uuid(),
  tokenId: z.string().regex(/^(tkn|ype)_(test|live)_[A-Za-z0-9]+$/, "Token inválido"),
  email: z.email(),
  deviceId: z.string().max(100).nullable().optional(),
  authentication3DS: z
    .object({
      eci: z.string().max(10),
      xid: z.string().max(200),
      cavv: z.string().max(200),
      protocolVersion: z.string().max(20),
      directoryServerTransactionId: z.string().max(200),
    })
    .nullable()
    .optional(),
});

export async function payWithCulqiAction(input: unknown): Promise<PayResult> {
  const parsed = payInputSchema.safeParse(input);
  if (!parsed.success) return { status: "declined", message: "No se pudo leer el pago. Vuelve a intentarlo." };
  const client = culqiFromEnv();
  if (!client) return { status: "not_payable", message: "El pago con tarjeta no está disponible ahora." };
  try {
    const result = await payOrderWithCulqi(getDb(), client, parsed.data);
    if (result.status !== "paid") return result;
    if (result.change) notifyAfterResponse({ type: "status", change: result.change });
    return { status: "paid" };
  } catch (error) {
    console.error("Culqi", error);
    return { status: "declined", message: "No pudimos comunicarnos con la pasarela. Espera un momento y vuelve a intentarlo: no se te cobró." };
  }
}

/** El navegador ya la achica (máx. 1600 px); esto solo frena archivos que no son una captura. */
const MAX_PROOF_BYTES = 4 * 1024 * 1024;

export type ProofUploadResult = { ok: true } | { ok: false; message: string };

/** Captura del pago con Yape/Plin: se guarda, el pedido pasa a "Pago por verificar" y le llega al equipo por email. */
export async function uploadPaymentProofAction(orderId: string, formData: FormData): Promise<ProofUploadResult> {
  if (!z.uuid().safeParse(orderId).success) return { ok: false, message: "No encontramos tu pedido." };
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: "Elige la captura del pago." };
  if (file.size > MAX_PROOF_BYTES) return { ok: false, message: "La imagen es muy pesada. Sube la captura de pantalla del pago." };
  if (!(await allowRequest("paymentProof"))) return { ok: false, message: "Subiste muchas imágenes seguidas. Espera un rato o envíala por WhatsApp." };

  try {
    const proof = await processProofImage(await file.arrayBuffer());
    const result = await submitPaymentProof(getDb(), orderId, proof);
    if (!result.ok) return result;
    // Cliente: "estamos verificando tu pago" (solo la primera vez). Equipo: cada captura, con la imagen.
    notifyAfterResponse(...(result.change ? [{ type: "status" as const, change: result.change }] : []), { type: "proof", orderId, proofId: result.proofId });
  } catch (error) {
    if (error instanceof InvalidProofError) return { ok: false, message: error.message };
    console.error("[captura de pago]", error instanceof Error ? error.message : error);
    return { ok: false, message: "No pudimos subir la captura. Vuelve a intentarlo o envíala por WhatsApp." };
  }
  refresh();
  return { ok: true };
}
