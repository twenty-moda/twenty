/** Enlace a WhatsApp con mensaje prellenado. */
export function whatsappUrl(phone: string, text?: string): string {
  const digits = phone.replace(/\D/g, "");
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}

/** Google Maps sin API key. */
export function mapsUrl(latitude: number, longitude: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
}

export function catalogUrl(params: Record<string, string | undefined> = {}): string {
  const query = new URLSearchParams(Object.entries(params).filter((e): e is [string, string] => !!e[1])).toString();
  return `/catalogo${query ? `?${query}` : ""}`;
}

export const siteUrl = () => (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");

/** URL absoluta de una imagen del bucket (para Open Graph y JSON-LD). */
export function absoluteMediaUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_MEDIA_URL ?? "/media";
  const url = /^https?:\/\//.test(base) ? base : `${siteUrl()}${base}`;
  return `${url.replace(/\/$/, "")}/${path}`;
}
