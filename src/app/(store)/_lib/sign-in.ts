/** Verificación del ingreso con Firebase, compartida por la tienda (/ingresar) y el panel (/admin/login). */
import { InvalidIdTokenError, verifyFirebaseIdToken, type FirebaseIdentity } from "@/server/services/firebase-auth";
import { allowRequest } from "./request";

export type SignInResult = { ok: true; next: string } | { ok: false; message: string };

/**
 * Verifica el ID token que manda el navegador después de entrar con Firebase (Google o correo y contraseña).
 * Lo usan la tienda y el panel.
 */
export async function verifySignInToken(idToken: unknown): Promise<{ ok: true; identity: FirebaseIdentity } | { ok: false; message: string }> {
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (!projectId) return { ok: false, message: "El ingreso aún no está disponible." };
  if (typeof idToken !== "string" || idToken.length > 5000) return { ok: false, message: "No pudimos leer tu cuenta. Inténtalo de nuevo." };
  if (!(await allowRequest("login"))) return { ok: false, message: "Hiciste muchos intentos seguidos. Espera unos minutos." };
  try {
    return { ok: true, identity: await verifyFirebaseIdToken(idToken, projectId) };
  } catch (error) {
    if (!(error instanceof InvalidIdTokenError)) console.error("[cuenta] No se pudo verificar el token", error instanceof Error ? error.message : error);
    return { ok: false, message: "No pudimos confirmar tu cuenta. Inténtalo de nuevo." };
  }
}
