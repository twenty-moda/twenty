"use server";

import { refresh } from "next/cache";
import { getDb } from "@/server/db/client";
import { getSiteSettings } from "@/server/services/content";
import { createGuide, sendGuide, type GuideInput } from "@/server/services/dispatch-guides";
import { sunatFromEnv } from "@/server/services/sunat";
import { requireStaff } from "../../../../_lib/auth";

/** Guarda la guía y la manda a SUNAT enseguida (si SUNAT no responde, queda pendiente y se reintenta desde la venta). */
export async function createGuideAction(input: GuideInput): Promise<{ ok: true } | { ok: false; message: string }> {
  const user = await requireStaff();
  const client = sunatFromEnv();
  if (!client) return { ok: false, message: "SUNAT todavía no está conectado: la guía de remisión se activa con la boleta y la factura." };
  const db = getDb();
  const created = await createGuide(db, input, user.id);
  if (!created.ok) return created;
  const settings = await getSiteSettings(db);
  await sendGuide(db, created.id, client, settings.company.ruc);
  refresh();
  return { ok: true };
}

/** Reintenta (o consulta) la guía en SUNAT. */
export async function retryGuideAction(guideId: string): Promise<string | null> {
  await requireStaff();
  const db = getDb();
  const settings = await getSiteSettings(db);
  const result = await sendGuide(db, guideId, sunatFromEnv(), settings.company.ruc).catch((error: unknown) => ({ status: "pendiente" as const, message: error instanceof Error ? error.message : "No se pudo enviar." }));
  refresh();
  return result.status === "aceptado" ? null : result.message;
}
