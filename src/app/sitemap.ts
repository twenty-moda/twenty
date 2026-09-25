import type { MetadataRoute } from "next";
import { LEGAL_PAGES } from "@/lib/legal-pages";
import { siteUrl } from "@/lib/links";
import { getPosts, getProductSlugs } from "./(store)/_data";

// Mismas URLs que el sitemap anterior (/, /catalogo, /product/…, /nosotros, /blogs, /post/…, /contacto) más las páginas nuevas.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const [slugs, posts] = await Promise.all([getProductSlugs(), getPosts()]);
  const pages: MetadataRoute.Sitemap = [
    { url: base, changeFrequency: "daily", priority: 1 },
    { url: `${base}/catalogo`, changeFrequency: "daily", priority: 0.9 },
    { url: `${base}/promos`, changeFrequency: "daily", priority: 0.8 },
    { url: `${base}/nosotros`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${base}/blogs`, changeFrequency: "weekly", priority: 0.6 },
    { url: `${base}/contacto`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${base}/tracking`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/libro-de-reclamaciones`, changeFrequency: "yearly", priority: 0.3 },
    ...LEGAL_PAGES.map((p) => ({ url: `${base}${p.href}`, changeFrequency: "yearly" as const, priority: 0.2 })),
  ];
  return [
    ...pages,
    ...slugs.map((slug) => ({ url: `${base}/product/${slug}`, changeFrequency: "weekly" as const, priority: 0.8 })),
    ...posts.map((p) => ({ url: `${base}/post/${p.slug}`, lastModified: p.publishedAt, changeFrequency: "monthly" as const, priority: 0.5 })),
  ];
}
