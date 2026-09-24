"use server";

import { refresh } from "next/cache";
import { after } from "next/server";
import { getDb } from "@/server/db/client";
import { respondComplaint } from "@/server/services/complaints";
import { getSiteSettings } from "@/server/services/content";
import { emailConfigured } from "@/server/services/email";
import { sendComplaintResponse } from "@/server/services/notifications";
import { requireAdmin } from "../../_lib/auth";
import { failure, form, success, type ActionState } from "../../_lib/action-state";

export async function respondComplaintAction(number: number, _: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const response = form.text(fd, "response");
  if (response.length < 10) return failure("Escribe la respuesta (mínimo 10 caracteres).", { response: "Escribe la respuesta" });
  if (response.length > 5000) return failure("La respuesta es muy larga (máximo 5000 caracteres).");

  const db = getDb();
  const result = await respondComplaint(db, number, response, admin.id);
  if (!result) return failure("El reclamo ya no existe.");
  const notify = form.bool(fd, "notify");
  if (notify) {
    after(async () => {
      try {
        await sendComplaintResponse(result.complaint, await getSiteSettings(db));
      } catch (error) {
        console.error("[reclamos] No se pudo enviar la respuesta por email", error instanceof Error ? error.message : error);
      }
    });
  }
  refresh();
  if (!notify) return success("Respuesta guardada. No se envió email: avísale al cliente por otro medio.");
  return success(emailConfigured() ? "Respuesta guardada y enviada al email del cliente." : "Respuesta guardada. El envío de emails aún no está configurado: envíasela al cliente por email tú mismo.");
}
