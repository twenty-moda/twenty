/** Culqi está listo si hay llave pública (navegador) y secreta (servidor). Solo usar en el servidor. */
export function culqiConfig(): { publicKey: string } | null {
  const publicKey = process.env.NEXT_PUBLIC_CULQI_PUBLIC_KEY;
  return publicKey && process.env.CULQI_SECRET_KEY ? { publicKey } : null;
}
