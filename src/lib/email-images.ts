/** Anchos de las fotos de los emails (el doble de lo que se ve, para pantallas nítidas). */
export const EMAIL_IMAGE_WIDTHS = [160, 400, 600] as const;

/**
 * URL de una imagen para un email. Las del bucket pasan por /api/email-image (JPEG); las de /public que ya son
 * JPEG o PNG van directo.
 */
export function emailImageSrc(path: string, baseUrl: string, width: number): string {
  // Absolutas y cid: (imagen adjunta en el mismo email, p. ej. la captura del pago) van tal cual.
  if (/^(https?:\/\/|cid:)/.test(path)) return path;
  if (path.startsWith("/")) return `${baseUrl}${path}`;
  return `${baseUrl}/api/email-image/${path.split("/").map(encodeURIComponent).join("/")}?w=${width}`;
}
