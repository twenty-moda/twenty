/**
 * Verifica el ID token que Firebase Authentication le da al navegador después de entrar con Google. Es un JWT
 * firmado por Google: se valida con sus llaves públicas (no hace falta una cuenta de servicio), el proyecto
 * (aud/iss), el vencimiento, que el email esté verificado y que el ingreso sea reciente. Firebase solo se usa para
 * saber quién es: la sesión de la tienda es la nuestra (cookie + tabla sessions), como la del panel.
 */
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";

const GOOGLE_KEYS = createRemoteJWKSet(new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"));
/** El token tiene que venir de un ingreso recién hecho (no de una sesión de Firebase vieja). */
const MAX_AUTH_AGE_SECONDS = 10 * 60;

export type GoogleIdentity = { uid: string; email: string; name: string | null; picture: string | null };

export class InvalidIdTokenError extends Error {}

export async function verifyFirebaseIdToken(idToken: string, projectId: string, keys: JWTVerifyGetKey = GOOGLE_KEYS, now = new Date()): Promise<GoogleIdentity> {
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
  if (provider !== "google.com") throw new InvalidIdTokenError("Solo se acepta el ingreso con Google");
  if (authTime > nowSeconds + 60 || nowSeconds - authTime > MAX_AUTH_AGE_SECONDS) throw new InvalidIdTokenError("Ingreso no reciente");

  return {
    uid: payload.sub,
    email: payload.email.trim().toLowerCase(),
    name: typeof payload.name === "string" && payload.name.trim() ? payload.name.trim() : null,
    picture: typeof payload.picture === "string" && payload.picture.startsWith("https://") ? payload.picture : null,
  };
}
