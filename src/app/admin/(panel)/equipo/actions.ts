"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { PANEL_ROLE_LABEL, PANEL_ROLES } from "@/lib/panel-access";
import { getDb } from "@/server/db/client";
import { createStaffAccount, grantPanelAccess, revokeAdmin, setOrderEmails, setPanelPassword, setPanelRole } from "@/server/services/accounts";
import { getSiteSettings } from "@/server/services/content";
import { emailConfigured } from "@/server/services/email";
import { sendAdminInvite } from "@/server/services/notifications";
import { requireAdmin } from "../../_lib/auth";
import { failure, form, success, zodFailure, type ActionState } from "../../_lib/action-state";

const name = z.string().trim().min(2, "Escribe su nombre").max(80);
const role = z.enum(PANEL_ROLES, "Elige el perfil");
const inviteSchema = z.object({ name, email: z.string().trim().toLowerCase().pipe(z.email("Revisa el correo")), role });
const staffSchema = z.object({ name, username: z.string().trim().min(1, "Escribe el usuario").max(60), password: z.string().min(1, "Escribe la contraseña").max(128), role });

/** Da acceso al panel: con usuario y contraseña (sin correo) o con el correo de la persona (Google / Firebase). */
export async function addMemberAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const db = getDb();
  if (form.text(fd, "method") === "usuario") {
    const parsed = staffSchema.safeParse({ name: form.text(fd, "name"), username: form.text(fd, "username"), password: String(fd.get("password") ?? ""), role: form.text(fd, "role") });
    if (!parsed.success) return zodFailure(parsed.error);
    const result = await createStaffAccount(db, parsed.data);
    if (!result.ok) return result.field ? failure(result.message, { [result.field]: result.message }) : failure(result.message);
    refresh();
    return success(`Listo: ${result.user.name} entra en /admin/login → «Usuario y contraseña» con el usuario ${result.user.username} y la contraseña que pusiste (${PANEL_ROLE_LABEL[parsed.data.role]}).`);
  }

  const parsed = inviteSchema.safeParse({ name: form.text(fd, "name"), email: form.text(fd, "email"), role: form.text(fd, "role") });
  if (!parsed.success) return zodFailure(parsed.error);
  const result = await grantPanelAccess(db, parsed.data);
  if (!result.ok) return failure(result.message);
  const user = result.user;
  refresh();
  const roleLabel = PANEL_ROLE_LABEL[parsed.data.role].toLowerCase();
  if (result.previousRole === parsed.data.role) return success(`${user.email} ya tenía ese acceso.`);
  if (result.previousRole && result.previousRole !== "customer") return success(`Listo: ${user.email} ahora es ${roleLabel}.`);

  const how = "Entra en /admin/login → «Google o correo» con su Google o con «Crear contraseña» usando ese correo.";
  if (!form.bool(fd, "notify") || !emailConfigured()) return success(`Listo: ${user.email} ya tiene acceso. ${how}`);
  try {
    await sendAdminInvite({ name: user.name, email: user.email }, admin.name, await getSiteSettings(db));
    return success(`Listo: ${user.email} ya tiene acceso y le enviamos un correo con las instrucciones.`);
  } catch (error) {
    console.error("[equipo] No se pudo enviar la invitación", error instanceof Error ? error.message : error);
    return success(`${user.email} ya tiene acceso, pero no se pudo enviar el correo. Avísale: ${how}`);
  }
}

export async function changeRoleAction(userId: string, nextRole: string): Promise<ActionState> {
  const admin = await requireAdmin();
  const parsed = role.safeParse(nextRole);
  if (!parsed.success) return failure("Elige el perfil.");
  if (userId === admin.id) return failure("No puedes cambiar tu propio perfil: pídeselo a otro admin.");
  const result = await setPanelRole(getDb(), userId, parsed.data);
  if (!result.ok) return failure(result.message);
  refresh();
  return success(`${result.name} ahora es ${PANEL_ROLE_LABEL[parsed.data].toLowerCase()}.`);
}

/** Avisos de pedidos por correo: cada admin decide si le llegan (también el propio). */
export async function setOrderEmailsAction(userId: string, enabled: boolean): Promise<ActionState> {
  await requireAdmin();
  const result = await setOrderEmails(getDb(), userId, enabled);
  if (!result.ok) return failure(result.message);
  refresh();
  return success(enabled ? `A ${result.name} le van a llegar los avisos de pedidos.` : `${result.name} ya no recibe los avisos de pedidos.`);
}

export async function resetPasswordAction(userId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  await requireAdmin();
  const result = await setPanelPassword(getDb(), userId, String(fd.get("password") ?? ""));
  if (!result.ok) return result.field ? failure(result.message, { [result.field]: result.message }) : failure(result.message);
  refresh();
  return success(`Contraseña cambiada. ${result.username} tiene que volver a entrar con la nueva.`);
}

export async function removeAdminAction(userId: string): Promise<ActionState> {
  const admin = await requireAdmin();
  const result = await revokeAdmin(getDb(), userId, admin.id);
  if (!result.ok) return failure(result.message);
  refresh();
  return success(`${result.login} ya no puede entrar al panel.`);
}
