/** Enlace a WhatsApp con mensaje prellenado. */
export function whatsappUrl(phone: string, text?: string): string {
  const digits = phone.replace(/\D/g, "");
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}

/** Google Maps sin API key. */
export function mapsUrl(latitude: number, longitude: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
}

/** La ruta hasta ese punto en Google Maps (en el celular abre la app). */
export function mapsDirectionsUrl(latitude: number, longitude: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`;
}

/** La ruta hasta ese punto en Waze (en el celular abre la app; si no la tiene, la web de Waze). */
export function wazeUrl(latitude: number, longitude: number): string {
  return `https://waze.com/ul?ll=${latitude},${longitude}&navigate=yes`;
}

/** Mapa de Google a color para un <iframe>, sin API key. */
export function mapEmbedUrl(latitude: number, longitude: number): string {
  return `https://maps.google.com/maps?q=${latitude},${longitude}&z=16&hl=es&output=embed`;
}

export function catalogUrl(params: Record<string, string | undefined> = {}): string {
  const query = new URLSearchParams(Object.entries(params).filter((e): e is [string, string] => !!e[1])).toString();
  return `/catalogo${query ? `?${query}` : ""}`;
}

export const siteUrl = () => (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");

/**
 * Base de los enlaces que la tienda manda fuera (emails, constancias). En Vercel es el dominio de producción del
 * proyecto: twentymoda.vercel.app mientras twentymoda.com siga apuntando al sitio anterior, y twentymoda.com
 * cuando se agregue el dominio (Vercel lo cambia solo). SEO y canónicas siguen usando siteUrl().
 */
export function appUrl(): string {
  const host = process.env.VERCEL_ENV === "production" ? process.env.VERCEL_PROJECT_PRODUCTION_URL : process.env.VERCEL_BRANCH_URL || process.env.VERCEL_URL;
  return host ? `https://${host}` : siteUrl();
}

/** URL absoluta de una imagen del bucket (Open Graph, JSON-LD, emails). Las que empiezan con "/" son de /public. */
export function absoluteMediaUrl(path: string, origin = siteUrl()): string {
  if (/^https?:\/\//.test(path)) return path;
  if (path.startsWith("/")) return `${origin}${path}`;
  const base = process.env.NEXT_PUBLIC_MEDIA_URL || "/media";
  const url = /^https?:\/\//.test(base) ? base : `${origin}${base}`;
  return `${url.replace(/\/$/, "")}/${path}`;
}
