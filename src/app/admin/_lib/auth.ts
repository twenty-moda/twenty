/**
 * Sesión del admin sobre las cookies de Next. La lógica (tokens) vive en server/services/auth y el ingreso
 * (Google o correo y contraseña con Firebase) en login/actions.ts: aquí solo se lee y escribe la cookie.
 * Cada página y cada acción del admin llama a requireAdmin(): el layout no alcanza porque no se
 * vuelve a ejecutar en cada navegación.
 */
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import { canAccess, isPanelRole, type PanelAccess, type PanelRole } from "@/lib/panel-access";
import { getDb } from "@/server/db/client";
import { createSession, deleteSession, validateSession, type SessionUser } from "@/server/services/auth";

const SESSION_COOKIE = "twenty_session";

export type StaffUser = SessionUser & { role: PanelRole };

/** Quien entra al panel: admin (todo) o un vendedor (venta presencial o virtual; ver src/lib/panel-access.ts). */
export const getStaff = cache(async (): Promise<StaffUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  // Todo lo que sigue (vencimiento de la sesión, datos del panel) depende de la hora actual: es por request.
  await connection();
  if (!token) return null;
  const user = await validateSession(getDb(), token, "admin");
  return user && isPanelRole(user.role) ? { ...user, role: user.role } : null;
});

export const getAdmin = cache(async (): Promise<StaffUser | null> => {
  const user = await getStaff();
  return user?.role === "admin" ? user : null;
});

/** Páginas y acciones de la tienda (punto de venta, caja, comprobantes, gastos): todo el equipo. */
export async function requireStaff(): Promise<StaffUser> {
  return requireAccess("staff");
}

/** Todo lo demás del panel. Un vendedor que llega aquí vuelve al punto de venta. */
export async function requireAdmin(): Promise<StaffUser> {
  return requireAccess("admin");
}

/** Pedidos de la web: el admin y la venta virtual. */
export async function requireOrders(): Promise<StaffUser> {
  return requireAccess("orders");
}

async function requireAccess(access: PanelAccess): Promise<StaffUser> {
  const user = await getStaff();
  if (!user) redirect("/admin/login");
  if (!canAccess(user.role, access)) redirect("/admin/pos");
  return user;
}

export async function startSession(userId: string) {
  const userAgent = (await headers()).get("user-agent");
  const { token, expiresAt } = await createSession(getDb(), userId, userAgent, "admin");
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function endSession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await deleteSession(getDb(), token);
  store.delete(SESSION_COOKIE);
}
