"use server";

import { createHash } from "node:crypto";
import { redirect } from "next/navigation";
import { allowRequest } from "@/app/(store)/_lib/request";
import { verifySignInToken, type SignInResult } from "@/app/(store)/_lib/sign-in";
import { isPanelRole, panelHome, type PanelRole } from "@/lib/panel-access";
import { getDb } from "@/server/db/client";
import { signInWithFirebase, signInWithPassword } from "@/server/services/accounts";
import { normalizeUsername } from "@/server/services/passwords";
import { consumeRateLimit, RATE_LIMITS } from "@/server/services/rate-limit";
import { endSession, startSession } from "../_lib/auth";

const nextPath = (next: unknown, role: PanelRole) => (typeof next === "string" && next.startsWith("/admin") && !next.startsWith("//") ? next : panelHome(role));

/**
 * Panel: entra con Google o con correo y contraseña (Firebase). Es la misma cuenta que en la tienda; solo pasa si
 * tiene un perfil del panel (admin o vendedor). No crea cuentas: el acceso se da en Equipo (o con `pnpm admin:create`).
 */
export async function adminSignInAction(idToken: unknown, next: unknown): Promise<SignInResult> {
  const verified = await verifySignInToken(idToken);
  if (!verified.ok) return verified;
  const result = await signInWithFirebase(getDb(), verified.identity, { createIfMissing: false });
  if (!result.ok || !isPanelRole(result.role)) {
    return { ok: false, message: result.ok || result.reason === "not_found" ? "Esta cuenta no tiene acceso al panel." : "Esta cuenta está desactivada." };
  }
  await startSession(result.userId);
  // El vendedor empieza en el punto de venta (el resumen y lo demás son del admin).
  return { ok: true, next: nextPath(next, result.role) };
}

/**
 * Panel con usuario y contraseña (equipo sin correo). Límite por IP y por usuario; el mensaje de error es el mismo
 * para usuario o contraseña equivocados.
 */
export async function passwordSignInAction(input: { username: unknown; password: unknown; next: unknown }): Promise<SignInResult> {
  const username = typeof input.username === "string" ? normalizeUsername(input.username).slice(0, 60) : "";
  const password = typeof input.password === "string" ? input.password.slice(0, 200) : "";
  if (!username || !password) return { ok: false, message: "Escribe tu usuario y tu contraseña." };
  const db = getDb();
  const userKey = createHash("sha256").update(`twenty-staff:${username}`).digest("hex").slice(0, 32);
  if (!(await allowRequest("staffLogin")) || !(await consumeRateLimit(db, `staffUser:${userKey}`, RATE_LIMITS.staffUser))) {
    return { ok: false, message: "Hubo muchos intentos seguidos. Espera unos minutos y vuelve a probar." };
  }
  const result = await signInWithPassword(db, { username, password });
  if (!result.ok) return { ok: false, message: "El usuario o la contraseña no son correctos." };
  await startSession(result.userId);
  return { ok: true, next: nextPath(input.next, result.role) };
}

export async function logoutAction() {
  await endSession();
  redirect("/admin/login");
}
