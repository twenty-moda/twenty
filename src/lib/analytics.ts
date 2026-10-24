/** Páginas cuyo id es la llave para verlas (no se adivina): a Vercel Analytics y Speed Insights va la ruta, no el id. */
const PRIVATE_PAGES = [/^(\/pedido\/)[^/]+/, /^(\/libro-de-reclamaciones\/constancia\/)[^/]+/];

/** "https://…/pedido/9f3c…?pagar=1" → "https://…/pedido/[id]?pagar=1". Las demás URLs quedan igual. */
export function hidePrivateIds(href: string): string {
  const url = new URL(href);
  const path = PRIVATE_PAGES.reduce((p, page) => p.replace(page, "$1[id]"), url.pathname);
  return path === url.pathname ? href : `${url.origin}${path}${url.search}`;
}
