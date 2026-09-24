import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/links";

// Buscadores y asistentes de IA pueden leer toda la tienda salvo el panel, el carrito y los datos de pedidos.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin", "/api/", "/cart", "/checkout", "/pedido/", "/libro-de-reclamaciones/constancia/"],
      },
    ],
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
