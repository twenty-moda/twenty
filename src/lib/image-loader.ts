// Función pura (sin "use client"): la usan tanto <Image> en el navegador como getImageProps en el servidor.
type LoaderArgs = { src: string; width: number; quality?: number };

const MEDIA_URL = (process.env.NEXT_PUBLIC_MEDIA_URL || "/media").replace(/\/$/, "");
const TRANSFORM = process.env.NEXT_PUBLIC_MEDIA_TRANSFORM;

/**
 * Las rutas relativas ("item/TMW-0001.webp") se resuelven contra el bucket de medios (R2/S3 + CDN).
 * Las que empiezan con "/" son archivos de /public. Con NEXT_PUBLIC_MEDIA_TRANSFORM=cloudflare
 * el CDN entrega cada imagen al ancho pedido; si no, se sirve el original.
 */
export default function mediaLoader({ src, width, quality }: LoaderArgs): string {
  const isAbsolute = /^https?:\/\//.test(src);
  const url = isAbsolute || src.startsWith("/") ? src : `${MEDIA_URL}/${src}`;

  if (TRANSFORM === "cloudflare" && !src.startsWith("/")) {
    const { origin, pathname } = new URL(url);
    return `${origin}/cdn-cgi/image/width=${width},quality=${quality ?? 75},format=auto${pathname}`;
  }
  // Sin transformación se sirve el original: la misma URL para todos los anchos, así el CDN la guarda una sola vez.
  return url;
}
