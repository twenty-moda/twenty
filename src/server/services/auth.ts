/**
 * Sesiones en BD. La cookie guarda un token aleatorio; en la BD solo está su SHA-256, así que una filtración de la
 * tabla no permite entrar. Quién es la persona lo confirma Firebase (Google o correo y contraseña; ver
 * firebase-auth.ts y accounts.ts): aquí no se guardan ni se comparan contraseñas.
 */
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, lt } from "drizzle-orm";
import type { Db } from "../db/client";
import { sessions, users } from "../db/schema";

export const SESSION_DAYS = 30;

export type SessionUser = { id: string; name: string; email: string; role: "admin" | "customer" };
/** "admin" = panel; "cuenta" = cuenta de cliente en la tienda. Cada cookie solo acepta sesiones de su tipo. */
export type SessionScope = "admin" | "cuenta";

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export async function createSession(db: Db, userId: string, userAgent: string | null, scope: SessionScope, now = new Date()) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(now.getTime() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  // Limpieza oportunista de las sesiones vencidas de esa persona.
  await db.delete(sessions).where(and(eq(sessions.userId, userId), lt(sessions.expiresAt, now)));
  await db.insert(sessions).values({ id: hashToken(token), userId, scope, expiresAt, userAgent: userAgent?.slice(0, 300) ?? null });
  return { token, expiresAt };
}

/** Una sesión de la cuenta (tienda) nunca vale para el panel, aunque la persona sea admin: el panel pide entrar ahí. */
export async function validateSession(db: Db, token: string, scope: SessionScope, now = new Date()): Promise<SessionUser | null> {
  const [row] = await db
    .select({ id: users.id, name: users.name, email: users.email, role: users.role, isActive: users.isActive })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, hashToken(token)), eq(sessions.scope, scope), gt(sessions.expiresAt, now)))
    .limit(1);
  if (!row || !row.isActive) return null;
  return { id: row.id, name: row.name, email: row.email, role: row.role };
}

export async function deleteSession(db: Db, token: string) {
  await db.delete(sessions).where(eq(sessions.id, hashToken(token)));
}
