/**
 * Lecturas cacheadas de la tienda. Solo envuelven servicios con 'use cache' + tags:
 * la navegación se sirve desde el caché/CDN y no llega a la base de datos.
 */
import { cacheLife, cacheTag } from "next/cache";
import { cacheTags } from "@/lib/cache-tags";
import { getDb } from "@/server/db/client";
import * as catalog from "@/server/services/catalog";
import * as content from "@/server/services/content";
import * as blog from "@/server/services/posts";
import type { Courier, CourierAgency, CourierTracking } from "@/lib/couriers";
import { courierFromEnv } from "@/server/services/courier-api";
import * as shipping from "@/server/services/shipping";

export async function getProductCards() {
  "use cache";
  cacheLife("hours");
  cacheTag(cacheTags.catalog);
  return catalog.listProductCards(getDb());
}

export async function getCategoryLinks() {
  "use cache";
  cacheLife("hours");
  cacheTag(cacheTags.catalog);
  return catalog.listCategoryLinks(getDb());
}

export async function getProductSlugs() {
  "use cache";
  cacheLife("hours");
  cacheTag(cacheTags.catalog);
  return catalog.listProductSlugs(getDb());
}

export async function getProduct(slug: string) {
  "use cache";
  cacheLife("hours");
  cacheTag(cacheTags.catalog, cacheTags.product(slug));
  const product = await catalog.getProductDetail(getDb(), slug);
  // Un conjunto muestra el stock y los precios de sus prendas: se refresca también cuando cambia alguna.
  if (product?.kind === "outfit") cacheTag(...product.pieces.map((piece) => cacheTags.product(piece.slug)));
  return product;
}

export async function getLegacyProductUrl(slug: string) {
  "use cache";
  cacheLife("days");
  cacheTag(cacheTags.catalog);
  return catalog.resolveLegacyProductUrl(getDb(), slug);
}

export async function getSiteSettings() {
  "use cache";
  cacheLife("hours");
  cacheTag(cacheTags.content);
  return content.getSiteSettings(getDb());
}

/** Formas de entrega y distritos con delivery Lima (con su precio). */
export async function getCheckoutShipping() {
  "use cache";
  cacheLife("hours");
  cacheTag(cacheTags.shipping);
  const db = getDb();
  const [methods, limaDistricts] = await Promise.all([shipping.listShippingMethods(db), shipping.listDeliveryDistricts(db)]);
  return {
    methods: methods.map(shipping.toShippingInfo),
    limaDistricts: limaDistricts.map((d) => ({ ubigeo: d.ubigeo, name: d.name, priceCents: d.deliveryPriceCents! })),
  };
}

/** Los 1,893 distritos del Perú en formato compacto (buscador de envío por agencia). */
export async function getAllDistricts() {
  "use cache";
  cacheLife("days");
  cacheTag(cacheTags.shipping);
  return shipping.listDistrictsCompact(getDb());
}

/** Año para el copyright: se fija en caché (la hora actual no puede ir en el HTML estático). */
export async function getCurrentYear() {
  "use cache";
  cacheLife("days");
  return new Date().getFullYear();
}

export async function getSlides() {
  "use cache";
  cacheLife("hours");
  cacheTag(cacheTags.content);
  return content.listVisibleSlides(getDb());
}

export async function getPosts() {
  "use cache";
  cacheLife("hours");
  cacheTag(cacheTags.blog);
  return blog.listPublishedPosts(getDb());
}

export async function getPost(slug: string) {
  "use cache";
  cacheLife("hours");
  cacheTag(cacheTags.blog);
  return blog.getPublishedPost(getDb(), slug);
}

export async function getFeedVariants() {
  "use cache";
  cacheLife("hours");
  cacheTag(cacheTags.catalog);
  return { variants: await catalog.listFeedVariants(getDb()), generatedAt: new Date().toISOString() };
}

/**
 * Agencias de Shalom u Olva que reciben envíos, con nuestro distrito (checkout y validación del pedido). Se piden a
 * la API una vez al día (los planes tienen cuota mensual). Si el courier no responde se guarda la lista vacía solo
 * unos minutos y el checkout vuelve a pedir la agencia como texto.
 */
export async function getCourierAgencies(courier: Courier): Promise<CourierAgency[]> {
  "use cache";
  cacheTag(cacheTags.shipping);
  const api = courierFromEnv(courier);
  if (!api) {
    cacheLife("hours");
    return [];
  }
  try {
    const agencies = await api.agencies(await shipping.listDistrictsCompact(getDb()));
    if (agencies.length) cacheLife("days");
    else cacheLife("minutes");
    return agencies;
  } catch (error) {
    console.error(`[${courier}] No se pudieron cargar las agencias`, error instanceof Error ? error.message : error);
    cacheLife("minutes");
    return [];
  }
}

/** Estado de una guía de Shalom u Olva (se consulta como mucho cada 15 minutos por guía). */
export async function getCourierTracking(courier: Courier, guideNumber: string, guideCode: string): Promise<CourierTracking | null> {
  "use cache";
  const api = courierFromEnv(courier);
  if (!api) {
    cacheLife("hours");
    return null;
  }
  try {
    const tracking = await api.track(guideNumber, guideCode);
    cacheLife({ stale: 300, revalidate: 900, expire: 86_400 });
    return tracking;
  } catch (error) {
    console.error(`[${courier}] No se pudo rastrear la guía`, error instanceof Error ? error.message : error);
    cacheLife("minutes");
    return null;
  }
}
