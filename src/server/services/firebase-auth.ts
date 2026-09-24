/**
 * Verifica el ID token que Firebase Authentication le da al navegador después de entrar con Google o con correo y
 * contraseña. Es un JWT firmado por Google: se valida con sus llaves públicas (no hace falta una cuenta de servicio),
 * el proyecto (aud/iss), el vencimiento, que el email esté verificado (las cuentas con contraseña confirman su
 * correo antes de poder entrar) y que el ingreso sea reciente. Firebase solo dice quién es: las sesiones de la
 * tienda y del panel son las nuestras (cookie + tabla sessions).
 */
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";

const GOOGLE_KEYS = createRemoteJWKSet(new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"));
/** El token tiene que venir de un ingreso recién hecho (no de una sesión de Firebase vieja). */
const MAX_AUTH_AGE_SECONDS = 10 * 60;

/** Métodos de ingreso aceptados. Firebase une los dos en una sola cuenta cuando el email es el mismo. */
export const SIGN_IN_PROVIDERS = ["google.com", "password"] as const;
export type SignInProvider = (typeof SIGN_IN_PROVIDERS)[number];

export type FirebaseIdentity = { uid: string; email: string; name: string | null; picture: string | null; provider: SignInProvider };

export class InvalidIdTokenError extends Error {}

export async function verifyFirebaseIdToken(idToken: string, projectId: string, keys: JWTVerifyGetKey = GOOGLE_KEYS, now = new Date()): Promise<FirebaseIdentity> {
  let payload;
  try {
    ({ payload } = await jwtVerify(idToken, keys, {
      algorithms: ["RS256"],
      issuer: `https://securetoken.google.com/${projectId}`,
      audience: projectId,
      currentDate: now,
    }));
  } catch {
    throw new InvalidIdTokenError("Token de Firebase inválido o vencido");
  }
  const provider = (payload.firebase as { sign_in_provider?: unknown } | undefined)?.sign_in_provider;
  const authTime = typeof payload.auth_time === "number" ? payload.auth_time : 0;
  const nowSeconds = Math.floor(now.getTime() / 1000);
  if (!payload.sub || typeof payload.email !== "string" || payload.email_verified !== true) throw new InvalidIdTokenError("Cuenta sin email verificado");
  if (!SIGN_IN_PROVIDERS.includes(provider as SignInProvider)) throw new InvalidIdTokenError("Método de ingreso no aceptado");
  if (authTime > nowSeconds + 60 || nowSeconds - authTime > MAX_AUTH_AGE_SECONDS) throw new InvalidIdTokenError("Ingreso no reciente");

  return {
    uid: payload.sub,
    email: payload.email.trim().toLowerCase(),
    name: typeof payload.name === "string" && payload.name.trim() ? payload.name.trim() : null,
    picture: typeof payload.picture === "string" && payload.picture.startsWith("https://") ? payload.picture : null,
    provider: provider as SignInProvider,
  };
}
