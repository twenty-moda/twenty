"use server";

import { redirect } from "next/navigation";
import { verifySignInToken, type SignInResult } from "@/app/(store)/_lib/sign-in";
import { getDb } from "@/server/db/client";
import { signInWithFirebase } from "@/server/services/accounts";
import { endSession, startSession } from "../_lib/auth";

/**
 * Panel: entra con Google o con correo y contraseña (Firebase). Es la misma cuenta que en la tienda; solo pasa si
 * tiene rol admin. No crea cuentas: el acceso se da con `pnpm admin:create`.
 */
export async function adminSignInAction(idToken: unknown, next: unknown): Promise<SignInResult> {
  const verified = await verifySignInToken(idToken);
  if (!verified.ok) return verified;
  const result = await signInWithFirebase(getDb(), verified.identity, { createIfMissing: false });
  if (!result.ok || result.role !== "admin") {
    return { ok: false, message: result.ok || result.reason === "not_found" ? "Esta cuenta no tiene acceso al panel." : "Esta cuenta está desactivada." };
  }
  await startSession(result.userId);
  return { ok: true, next: typeof next === "string" && next.startsWith("/admin") && !next.startsWith("//") ? next : "/admin" };
}

export async function logoutAction() {
  await endSession();
  redirect("/admin/login");
}
