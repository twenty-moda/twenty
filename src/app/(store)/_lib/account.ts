/**
 * Sesión de la cuenta de cliente en la tienda (cookie propia, distinta de la del panel). La lógica vive en
 * server/services (auth y accounts): aquí solo se lee y escribe la cookie.
 */
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import { getDb } from "@/server/db/client";
import type { AccountUser } from "@/server/services/accounts";
import { createSession, deleteSession, validateSession } from "@/server/services/auth";

const ACCOUNT_COOKIE = "twenty_cuenta";

export const getAccount = cache(async (): Promise<AccountUser | null> => {
  const token = (await cookies()).get(ACCOUNT_COOKIE)?.value;
  await connection();
  if (!token) return null;
  const user = await validateSession(getDb(), token, "cuenta");
  return user ? { id: user.id, name: user.name, email: user.email } : null;
});

/** Para páginas de /cuenta: sin sesión, a /ingresar y de vuelta a donde estaba. */
export async function requireAccount(returnTo: string): Promise<AccountUser> {
  const user = await getAccount();
  if (!user) redirect(`/ingresar?volver=${encodeURIComponent(returnTo)}`);
  return user;
}

export async function startAccountSession(userId: string) {
  const userAgent = (await headers()).get("user-agent");
  const { token, expiresAt } = await createSession(getDb(), userId, userAgent, "cuenta");
  (await cookies()).set(ACCOUNT_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function endAccountSession() {
  const store = await cookies();
  const token = store.get(ACCOUNT_COOKIE)?.value;
  if (token) await deleteSession(getDb(), token);
  store.delete(ACCOUNT_COOKIE);
}
