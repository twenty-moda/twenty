/** Páginas cuyo id es la llave para verlas (no se adivina): a Vercel Analytics y Speed Insights va la ruta, no el id. */
const PRIVATE_PAGES = [/^(\/pedido\/)[^/]+/, /^(\/libro-de-reclamaciones\/constancia\/)[^/]+/];

/** "https://…/pedido/9f3c…?pagar=1" → "https://…/pedido/[id]?pagar=1". Las demás URLs quedan igual. */
export function hidePrivateIds(href: string): string {
  const url = new URL(href);
  const path = PRIVATE_PAGES.reduce((p, page) => p.replace(page, "$1[id]"), url.pathname);
  return path === url.pathname ? href : `${url.origin}${path}${url.search}`;
}

// ─── Nombres para /admin/visitas ─────────────────────────────────────────────

/** "Others" = lo que la API junta cuando hay más filas que el límite. */
export const OTHERS = "Others";

const ROUTES: Record<string, string> = {
  "/": "Inicio",
  "/catalogo": "Catálogo",
  "/promos": "Promos",
  "/product/[slug]": "Fichas de prendas",
  "/cart": "Carrito",
  "/checkout": "Checkout",
  "/pedido/[id]": "Página del pedido",
  "/tracking": "Seguimiento",
  "/nosotros": "Nosotros",
  "/blogs": "Blog",
  "/post/[slug]": "Artículos del blog",
  "/contacto": "Contacto",
  "/ingresar": "Ingresar",
  "/cuenta": "Mi cuenta",
  "/cuenta/direcciones": "Mis direcciones",
  "/cuenta/datos": "Mis datos",
  "/libro-de-reclamaciones": "Libro de Reclamaciones",
  "/libro-de-reclamaciones/constancia/[id]": "Constancias de reclamos",
  "/terminos-y-condiciones": "Términos y condiciones",
  "/politica-de-privacidad": "Política de privacidad",
  "/politicas-de-envio": "Políticas de envío",
  "/politicas-de-devolucion-y-cambio": "Devoluciones y cambios",
};

export function routeLabel(route: string): string {
  return route === OTHERS ? "Otras páginas" : (ROUTES[route] ?? route);
}

/** Sitios de origen agrupados por red ("l.instagram.com" y "instagram.com" = Instagram). */
const SOURCES: [RegExp, string][] = [
  [/(^|\.)instagram\.com$/, "Instagram"],
  [/(^|\.)(facebook\.com|fb\.com|fb\.me)$/, "Facebook"],
  [/(^|\.)tiktok\.com$/, "TikTok"],
  [/(^|\.)(whatsapp\.com|wa\.me)$/, "WhatsApp"],
  [/(^|\.)google\.[a-z.]+$/, "Google"],
  [/(^|\.)bing\.com$/, "Bing"],
  [/(^|\.)youtube\.com$/, "YouTube"],
  [/(^|\.)(t\.co|x\.com|twitter\.com)$/, "X (Twitter)"],
  [/(^|\.)(chatgpt\.com|openai\.com)$/, "ChatGPT"],
];

export function sourceLabel(hostname: string): string {
  if (hostname === OTHERS) return "Otros sitios";
  if (!hostname) return "Directo o sin enlace";
  const host = hostname.replace(/^www\./, "");
  return SOURCES.find(([pattern]) => pattern.test(host))?.[1] ?? host;
}

/** Junta las filas que caen en el mismo nombre (sumando `by`), de mayor a menor y con "Others" al final. */
export function groupRows(rows: { key: string; visitors: number; pageviews: number }[], label: (key: string) => string, by: "visitors" | "pageviews") {
  const groups = new Map<string, { key: string; label: string; value: number; others: boolean }>();
  for (const row of rows) {
    const name = label(row.key);
    const group = groups.get(name) ?? { key: name, label: name, value: 0, others: row.key === OTHERS };
    group.value += row[by];
    groups.set(name, group);
  }
  return [...groups.values()].sort((a, b) => Number(a.others) - Number(b.others) || b.value - a.value);
}

const DEVICES: Record<string, string> = { mobile: "Teléfono", desktop: "Computadora", tablet: "Tablet" };

export function deviceLabel(device: string): string {
  return device === OTHERS ? "Otros" : (DEVICES[device] ?? (device || "Sin dato"));
}

const regionNames = new Intl.DisplayNames(["es"], { type: "region" });

export function countryLabel(code: string): string {
  if (code === OTHERS) return "Otros países";
  try {
    return code ? (regionNames.of(code) ?? code) : "Sin dato";
  } catch {
    return code;
  }
}
