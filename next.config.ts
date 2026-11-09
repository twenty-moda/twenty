import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { NextConfig } from "next";

type Redirect = { source: string; destination: string; permanent: boolean };

/**
 * URLs de productos de la plataforma anterior (variantes y sitemap viejo) → producto nuevo, con 308.
 * El archivo lo genera `pnpm db:seed` desde el catálogo migrado; se aplica en el CDN sin tocar la BD.
 */
function legacyRedirects(): Redirect[] {
  const file = path.join(process.cwd(), "src/server/db/seed/legacy-redirects.json");
  return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as Redirect[]) : [];
}

/** Otras URLs de la web anterior. */
function siteRedirects(): Redirect[] {
  const media = (process.env.NEXT_PUBLIC_MEDIA_URL || "/media").replace(/\/$/, "");
  return [
    { source: "/libro-reclamaciones", destination: "/libro-de-reclamaciones", permanent: true },
    // El llms.txt anterior enlazaba esta variante.
    { source: "/politicas-de-privacidad", destination: "/politica-de-privacidad", permanent: true },
    // Fotos que Google y el feed anterior conocen por su ruta vieja.
    { source: "/storage/images/:path*", destination: `${media}/:path*`, permanent: true },
    ...Object.entries({
      items: "item",
      item_images: "item",
      posts: "post",
      sliders: "slider",
      categories: "category",
      subcategories: "sub_category",
      aboutuses: "aboutus",
      strengths: "strength",
    }).map(([from, to]) => ({ source: `/api/${from}/media/:file`, destination: `${media}/${to}/:file`, permanent: true })),
    // Login y registro de la web anterior: ahora se entra con Google en /ingresar (sin contraseñas que recuperar).
    ...["/iniciar-sesion", "/crear-cuenta", "/forgot-password", "/reset-password"].map((source) => ({ source, destination: "/ingresar", permanent: true })),
  ];
}

/**
 * Cabeceras de seguridad de todas las rutas. Sin CSP para scripts: con el prerender y 'use cache' haría falta un nonce
 * por request; aquí va solo lo que no toca a Culqi, Firebase ni los mapas de Google.
 */
const securityHeaders = [
  // Nadie puede mostrar la tienda ni el panel dentro de un iframe de otro sitio (clickjacking).
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  // El enlace del pedido (/pedido/<id>) da acceso a sus datos: a otros sitios solo les llega el dominio.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // La ubicación la usa el checkout para la agencia más cercana; la tienda no usa cámara ni micrófono.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self), browsing-topics=()" },
];

/** El panel lee las etiquetas con la cámara del teléfono o la tablet (punto de venta, movimientos y etiquetas). */
const panelHeaders = [{ key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(self), browsing-topics=()" }];

const nextConfig: NextConfig = {
  // Modelo de caché de Next 16: 'use cache' + cacheTag. Catálogo estático en CDN,
  // invalidado por tag desde el admin (updateTag / revalidateTag).
  cacheComponents: true,
  partialPrefetching: true,
  images: {
    // Las fotos ya son WebP y se sirven desde R2/S3 con CDN. No usamos el optimizador de Vercel.
    loader: "custom",
    loaderFile: "./src/lib/image-loader.ts",
  },
  poweredByHeader: false,
  experimental: {
    // Fotos del admin: el navegador las achica antes, pero una foto grande puede pasar de 1 MB.
    // Se queda bajo el límite de 4.5 MB por request de Vercel.
    serverActions: { bodySizeLimit: "4mb" },
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Va después: si dos reglas ponen la misma cabecera, gana la última.
      { source: "/admin/:path*", headers: panelHeaders },
      // El lector de códigos en WebAssembly lleva la versión en el nombre: nunca cambia.
      { source: "/vendor/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] },
    ];
  },
  async redirects() {
    return [...siteRedirects(), ...legacyRedirects()];
  },
};

export default nextConfig;
