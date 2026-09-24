"use server";

import { after } from "next/server";
import { failure, formValues, success, type ActionState } from "@/lib/action-state";
import { contactSchema, formErrors } from "@/lib/public-forms";
import { getDb } from "@/server/db/client";
import { getSiteSettings } from "@/server/services/content";
import { createContactMessage } from "@/server/services/messages";
import { sendContactNotification } from "@/server/services/notifications";
import { absoluteUrl, allowRequest } from "../_lib/request";

export async function contactAction(_: ActionState, fd: FormData): Promise<ActionState> {
  // Los bots llenan el campo oculto: se responde como si nada para no darles pistas.
  if (fd.get("website")) return success("¡Gracias! Te responderemos pronto.");
  const values = formValues(fd);
  const parsed = contactSchema.safeParse(values);
  if (!parsed.success) return failure("Revisa los campos marcados.", formErrors(parsed.error), values);
  if (!(await allowRequest("contact"))) {
    return failure("Enviaste varios mensajes seguidos. Inténtalo en una hora o escríbenos por WhatsApp.", undefined, values);
  }

  const db = getDb();
  await createContactMessage(db, parsed.data);
  after(async () => {
    try {
      await sendContactNotification(parsed.data, await getSiteSettings(db), absoluteUrl("/admin/mensajes"));
    } catch (error) {
      console.error("[contacto] No se pudo enviar el aviso por email", error instanceof Error ? error.message : error);
    }
  });
  return success("¡Gracias! Recibimos tu mensaje y te responderemos pronto.");
}
