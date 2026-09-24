"use server";

import { redirect } from "next/navigation";
import { getDb } from "@/server/db/client";
import { authenticate } from "@/server/services/auth";
import { endSession, startSession } from "../_lib/auth";
import { failure, type ActionState } from "../_lib/action-state";

export async function loginAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return failure("Escribe tu email y contraseña.");

  const result = await authenticate(getDb(), email, password);
  if (!result.ok) {
    return failure(
      result.reason === "rate_limited"
        ? "Demasiados intentos. Espera 15 minutos o pide ayuda para restablecer tu contraseña."
        : "Email o contraseña incorrectos.",
    );
  }
  if (result.user.role !== "admin") return failure("Esta cuenta no tiene acceso al panel.");

  await startSession(result.user.id);
  const next = String(formData.get("next") ?? "");
  redirect(next.startsWith("/admin") && !next.startsWith("//") ? next : "/admin");
}

export async function logoutAction() {
  await endSession();
  redirect("/admin/login");
}
