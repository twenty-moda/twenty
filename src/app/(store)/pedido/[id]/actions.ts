"use server";

import { z } from "zod";
import { getDb } from "@/server/db/client";
import { culqiFromEnv, payOrderWithCulqi, type PayResult } from "@/server/services/payments";

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
    return await payOrderWithCulqi(getDb(), client, parsed.data);
  } catch (error) {
    console.error("Culqi", error);
    return { status: "declined", message: "No pudimos comunicarnos con la pasarela. Espera un momento y vuelve a intentarlo: no se te cobró." };
  }
}
