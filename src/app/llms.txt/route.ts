import { LEGAL_PAGES } from "@/lib/legal-pages";
import { catalogUrl, siteUrl } from "@/lib/links";
import { richTextToPlain } from "@/lib/rich-text";
import { getCategoryLinks, getPosts, getSiteSettings } from "../(store)/_data";

// Resumen de la tienda para asistentes de IA (https://llmstxt.org), armado con el contenido del admin.
export async function GET() {
  const base = siteUrl();
  const [settings, categories, posts] = await Promise.all([getSiteSettings(), getCategoryLinks(), getPosts()]);
  const { seo, contact, store, faqs, company } = settings;
  const lines = [
    "# TWENTY",
    "",
    `> ${seo.description}`,
    "",
    "Tienda online de moda urbana juvenil en Perú. Precios en soles (PEN). Delivery en Lima Metropolitana y envíos a todo el Perú por agencia (Shalom, Olva), con recojo gratis en la tienda de Gamarra.",
    "",
    "## Catálogo",
    `- [Catálogo completo](${base}/catalogo): todos los productos con filtros por categoría, corte, talla y color.`,
    `- [Promos](${base}/promos): promociones "N x S/" (llevando N prendas de la promo) y prendas con descuento.`,
    `- [Feed de productos](${base}/products-feed.json): todos los SKU con precio, talla, color y stock en JSON.`,
    ...categories.map((c) => `- [${c.name}](${base}${catalogUrl({ categoria: c.slug })}): ${c.productCount} ${c.productCount === 1 ? "producto" : "productos"}.`),
    "",
    "## Políticas",
    ...LEGAL_PAGES.map((p) => `- [${p.title}](${base}${p.href}): ${p.description}`),
    `- [Libro de Reclamaciones](${base}/libro-de-reclamaciones)`,
    "",
    ...(faqs.length ? ["## Preguntas frecuentes", ...faqs.flatMap((f) => [`### ${f.question}`, richTextToPlain(f.answer), ""])] : []),
    ...(posts.length ? ["## Blog", ...posts.map((p) => `- [${p.title}](${base}/post/${p.slug}): ${p.summary}`), ""] : []),
    "## Contacto",
    contact.whatsapp ? `- WhatsApp: ${contact.whatsapp}` : null,
    contact.email ? `- Email: ${contact.email}` : null,
    store ? `- Tienda física: ${store.address} (${store.latitude}, ${store.longitude})` : null,
    contact.openingHours ? `- Horario: ${contact.openingHours}` : null,
    company.legalName ? `- Empresa: ${company.legalName}${company.ruc ? `, RUC ${company.ruc}` : ""}` : null,
    `- [Página de contacto](${base}/contacto)`,
  ].filter((l): l is string => l !== null);
  return new Response(`${lines.join("\n")}\n`, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
