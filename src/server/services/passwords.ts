/**
 * Contraseñas del equipo que entra con usuario (sin correo): TWENTY no tiene correo corporativo y no quiere usar los
 * personales (pedido del 08/11/2026). Se guardan con scrypt (en Node, sin librerías) y una sal por contraseña; las
 * cuentas con correo siguen entrando por Firebase y aquí no tienen nada.
 */
import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";

const PARAMS = { N: 16_384, r: 8, p: 1 } as const;
const KEY_LENGTH = 64;
const PREFIX = "scrypt";

const derive = (password: string, salt: Buffer, options: ScryptOptions) =>
  new Promise<Buffer>((resolve, reject) =>
    scrypt(password.normalize("NFKC"), salt, KEY_LENGTH, { ...options, maxmem: 64 * 1024 * 1024 }, (error, key) => (error ? reject(error) : resolve(key))),
  );

/** "scrypt$16384$8$1$<sal>$<clave>" (base64url): los parámetros van con el hash, así se pueden subir sin romper los viejos. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, PARAMS);
  return [PREFIX, PARAMS.N, PARAMS.r, PARAMS.p, salt.toString("base64url"), key.toString("base64url")].join("$");
}

export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  const parts = stored?.split("$") ?? [];
  if (parts.length !== 6 || parts[0] !== PREFIX) {
    // Sin hash (o con otro formato) igual se calcula uno: la respuesta tarda lo mismo y no dice si el usuario existe.
    await derive(password, Buffer.alloc(16), PARAMS);
    return false;
  }
  const [, n, r, p, salt, key] = parts;
  const expected = Buffer.from(key, "base64url");
  const actual = await derive(password, Buffer.from(salt, "base64url"), { N: Number(n), r: Number(r), p: Number(p) });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Usuario: en minúsculas, de 3 a 30 letras, números, punto, guion o guion bajo (sin @: así no se confunde con un correo). */
export const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{2,29}$/;
export const normalizeUsername = (value: string) => value.trim().toLowerCase();

export const PASSWORD_MIN = 8;
/** Lo que falla de una contraseña nueva, o null si sirve. */
export function passwordProblem(password: string, username?: string | null): string | null {
  if (password.length < PASSWORD_MIN) return `La contraseña necesita al menos ${PASSWORD_MIN} caracteres.`;
  if (password.length > 128) return "La contraseña es demasiado larga.";
  if (username && password.toLowerCase().includes(username.toLowerCase())) return "La contraseña no puede contener el usuario.";
  if (/^(\d)\1+$|^12345678|^(password|contraseña|twenty)/i.test(password)) return "Esa contraseña es muy fácil de adivinar.";
  return null;
}
