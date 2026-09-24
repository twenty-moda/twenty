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
import { getDb } from "@/server/db/client";
import { createSession, deleteSession, validateSession, type SessionUser } from "@/server/services/auth";

const SESSION_COOKIE = "twenty_session";

export const getAdmin = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  // Todo lo que sigue (vencimiento de la sesión, datos del panel) depende de la hora actual: es por request.
  await connection();
  if (!token) return null;
  const user = await validateSession(getDb(), token, "admin");
  return user?.role === "admin" ? user : null;
});

export async function requireAdmin(): Promise<SessionUser> {
  const user = await getAdmin();
  if (!user) redirect("/admin/login");
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
