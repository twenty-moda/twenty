"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { getDb } from "@/server/db/client";
import { grantAdmin, revokeAdmin } from "@/server/services/accounts";
import { getSiteSettings } from "@/server/services/content";
import { emailConfigured } from "@/server/services/email";
import { sendAdminInvite } from "@/server/services/notifications";
import { requireAdmin } from "../../_lib/auth";
import { failure, form, success, zodFailure, type ActionState } from "../../_lib/action-state";

const inviteSchema = z.object({
  name: z.string().trim().min(2, "Escribe su nombre").max(80),
  email: z.string().trim().toLowerCase().pipe(z.email("Revisa el correo")),
});

export async function addAdminAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const parsed = inviteSchema.safeParse({ name: form.text(fd, "name"), email: form.text(fd, "email") });
  if (!parsed.success) return zodFailure(parsed.error);

  const db = getDb();
  const user = await grantAdmin(db, parsed.data);
  refresh();
  if (user.alreadyAdmin) return success(`${user.email} ya tenía acceso al panel.`);

  const how = "Entra en /admin/login con su Google o con «Crear contraseña» usando ese correo.";
  if (!form.bool(fd, "notify") || !emailConfigured()) return success(`Listo: ${user.email} ya tiene acceso. ${how}`);
  try {
    await sendAdminInvite({ name: user.name, email: user.email }, admin.name, await getSiteSettings(db));
    return success(`Listo: ${user.email} ya tiene acceso y le enviamos un correo con las instrucciones.`);
  } catch (error) {
    console.error("[equipo] No se pudo enviar la invitación", error instanceof Error ? error.message : error);
    return success(`${user.email} ya tiene acceso, pero no se pudo enviar el correo. Avísale: ${how}`);
  }
}

export async function removeAdminAction(userId: string): Promise<ActionState> {
  const admin = await requireAdmin();
  const result = await revokeAdmin(getDb(), userId, admin.id);
  if (!result.ok) return failure(result.message);
  refresh();
  return success(`${result.email} ya no puede entrar al panel (su cuenta de la tienda sigue igual).`);
}
