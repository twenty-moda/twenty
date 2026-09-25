"use server";

import { refresh } from "next/cache";
import { getDb } from "@/server/db/client";
import { getSiteSettings } from "@/server/services/content";
import { emailConfigured } from "@/server/services/email";
import { deleteSubscriber, getContactMessage, recordContactReply, setMessageHandled } from "@/server/services/messages";
import { sendContactReply } from "@/server/services/notifications";
import { requireAdmin } from "../../_lib/auth";
import { failure, form, success, type ActionState } from "../../_lib/action-state";

export async function setMessageHandledAction(id: string, handled: boolean) {
  await requireAdmin();
  await setMessageHandled(getDb(), id, handled);
  refresh();
}

const MAX_REPLY = 5000;

/**
 * Responde un mensaje de contacto por email desde la tienda (Resend). Se envía antes de responder la acción: así el
 * panel dice si llegó a salir. Queda guardado y el mensaje pasa a atendido.
 */
export async function replyByEmailAction(messageId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const body = form.text(fd, "body");
  if (body.length < 2) return failure("Escribe la respuesta.", { body: "Escribe la respuesta" });
  if (body.length > MAX_REPLY) return failure(`La respuesta es muy larga (máximo ${MAX_REPLY} caracteres).`);
  if (!emailConfigured()) return failure("El envío de emails no está configurado en este entorno.");

  const db = getDb();
  const message = await getContactMessage(db, messageId);
  if (!message) return failure("El mensaje ya no existe.");
  try {
    const { sent } = await sendContactReply(message, body, await getSiteSettings(db));
    if (!sent) return failure("No se pudo enviar el email.");
  } catch (error) {
    console.error("[mensajes] No se pudo enviar la respuesta", error instanceof Error ? error.message : error);
    return failure("No se pudo enviar el email. Vuelve a intentarlo en un momento.");
  }
  await recordContactReply(db, { messageId, channel: "email", body, userId: admin.id });
  return success(`Enviado a ${message.email}. El mensaje pasó a Atendidos.`);
}

/** WhatsApp se abre en el navegador con el texto: aquí solo se guarda lo que se le escribió y se marca como atendido. */
export async function recordWhatsappReplyAction(messageId: string, body: string) {
  const admin = await requireAdmin();
  const text = body.trim().slice(0, MAX_REPLY);
  if (!text) return;
  await recordContactReply(getDb(), { messageId, channel: "whatsapp", body: text, userId: admin.id });
}

export async function deleteSubscriberAction(id: string) {
  await requireAdmin();
  await deleteSubscriber(getDb(), id);
  refresh();
}
