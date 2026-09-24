/**
 * Autenticación con sesiones en BD. La cookie guarda un token aleatorio; en la BD solo está su SHA-256,
 * así que una filtración de la tabla no permite entrar. Las contraseñas usan bcrypt (compatible con los
 * hashes `$2y$` de Laravel migrados).
 */
import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { and, eq, gt, lt, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { loginAttempts, sessions, users } from "../db/schema";

export const SESSION_DAYS = 30;
const MAX_FAILED_ATTEMPTS = 5;
const ATTEMPT_WINDOW_MINUTES = 15;
const BCRYPT_COST = 12;
// Hash de una contraseña cualquiera: se compara aunque el email no exista, para no revelar qué emails hay.
const DUMMY_HASH = "$2b$12$mjTFLaBHu0bbot.Su33E/OI2DKYOZxkU5QtRgetpE36fS1fGltSnG";

export type SessionUser = { id: string; name: string; email: string; role: "admin" | "customer" };

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
export const normalizeEmail = (email: string) => email.trim().toLowerCase();

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash.replace(/^\$2y\$/, "$2b$"));
}

export async function createSession(db: Db, userId: string, userAgent: string | null, now = new Date()) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(now.getTime() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await db.insert(sessions).values({ id: hashToken(token), userId, expiresAt, userAgent: userAgent?.slice(0, 300) ?? null });
  return { token, expiresAt };
}

export async function validateSession(db: Db, token: string, now = new Date()): Promise<SessionUser | null> {
  const [row] = await db
    .select({ id: users.id, name: users.name, email: users.email, role: users.role, isActive: users.isActive })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, hashToken(token)), gt(sessions.expiresAt, now)))
    .limit(1);
  if (!row || !row.isActive) return null;
  return { id: row.id, name: row.name, email: row.email, role: row.role };
}

export async function deleteSession(db: Db, token: string) {
  await db.delete(sessions).where(eq(sessions.id, hashToken(token)));
}

export type LoginResult = { ok: true; user: SessionUser } | { ok: false; reason: "invalid" | "rate_limited" };

/** Email + contraseña. Tras 5 intentos fallidos en 15 minutos se bloquea ese email un rato. */
export async function authenticate(db: Db, emailInput: string, password: string, now = new Date()): Promise<LoginResult> {
  const email = normalizeEmail(emailInput);
  const key = `email:${email}`;
  const since = new Date(now.getTime() - ATTEMPT_WINDOW_MINUTES * 60 * 1000);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(loginAttempts)
    .where(and(eq(loginAttempts.key, key), gt(loginAttempts.createdAt, since)));
  if (count >= MAX_FAILED_ATTEMPTS) return { ok: false, reason: "rate_limited" };

  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  const valid = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !user.passwordHash || !valid || !user.isActive) {
    await db.insert(loginAttempts).values({ key });
    return { ok: false, reason: "invalid" };
  }

  await db.delete(loginAttempts).where(eq(loginAttempts.key, key));
  await db.update(users).set({ lastLoginAt: now }).where(eq(users.id, user.id));
  // Limpieza oportunista de sesiones vencidas.
  await db.delete(sessions).where(and(eq(sessions.userId, user.id), lt(sessions.expiresAt, now)));
  return { ok: true, user: { id: user.id, name: user.name, email: user.email, role: user.role } };
}

/** Crea o actualiza un usuario (lo usa el script `pnpm admin:create`). */
export async function upsertUser(db: Db, input: { name: string; email: string; password: string; role: "admin" | "customer" }) {
  const email = normalizeEmail(input.email);
  const passwordHash = await hashPassword(input.password);
  const [user] = await db
    .insert(users)
    .values({ name: input.name, email, passwordHash, role: input.role })
    .onConflictDoUpdate({ target: users.email, set: { name: input.name, passwordHash, role: input.role, isActive: true } })
    .returning({ id: users.id, email: users.email });
  // Cambiar la contraseña cierra las sesiones abiertas.
  await db.delete(sessions).where(eq(sessions.userId, user.id));
  return user;
}
