/**
 * Lecturas cacheadas de la tienda. Solo envuelven servicios con 'use cache' + tags:
 * la navegación se sirve desde el caché/CDN y no llega a la base de datos.
 *
 * Duran un día: lo que cambia por el panel (updateTag) o por una venta (revalidateTag) ya se refresca con los tags.
 * En Vercel 'use cache' vive en la memoria de cada instancia, así que cada página que se regenera vuelve a leer la BD:
 * con "hours" eran ~80 páginas por hora leyendo el catálogo, y en octubre de 2026 se acabaron los 5 GB de Neon.
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

const DAY = 86_400;

/** Un día, o hasta `next` si llega antes (empieza o termina una promo, sale un post programado). */
function lifeUntil(next: Date | null) {
  const seconds = next ? Math.ceil((next.getTime() - Date.now()) / 1000) : DAY;
  return { stale: 300, revalidate: Math.min(DAY, Math.max(60, seconds)), expire: 7 * DAY };
}

export async function getProductCards() {
  "use cache";
  cacheTag(cacheTags.catalog);
  const db = getDb();
  const [cards, next] = await Promise.all([catalog.listProductCards(db), catalog.nextPromotionChange(db)]);
  cacheLife(lifeUntil(next));
  return cards;
}

export async function getCategoryLinks() {
  "use cache";
  cacheLife("days");
  cacheTag(cacheTags.catalog);
  return catalog.listCategoryLinks(getDb(), await getProductCards());
}

export async function getProductSlugs() {
  "use cache";
  cacheLife("days");
  cacheTag(cacheTags.catalog);
  return catalog.listProductSlugs(getDb());
}

export async function getProduct(slug: string) {
  "use cache";
  cacheTag(cacheTags.catalog, cacheTags.product(slug));
  const db = getDb();
  const [product, next] = await Promise.all([catalog.getProductDetail(db, slug), catalog.nextPromotionChange(db)]);
  cacheLife(lifeUntil(next));
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
  cacheLife("days");
  cacheTag(cacheTags.content);
  return content.getSiteSettings(getDb());
}

/** Formas de entrega y distritos con delivery Lima (con su precio). */
export async function getCheckoutShipping() {
  "use cache";
  cacheLife("days");
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
  cacheLife("days");
  cacheTag(cacheTags.content);
  return content.listVisibleSlides(getDb());
}

export async function getPosts() {
  "use cache";
  cacheTag(cacheTags.blog);
  const db = getDb();
  const [posts, next] = await Promise.all([blog.listPublishedPosts(db), blog.nextScheduledPost(db)]);
  cacheLife(lifeUntil(next));
  return posts;
}

export async function getPost(slug: string) {
  "use cache";
  cacheTag(cacheTags.blog);
  const db = getDb();
  const [post, next] = await Promise.all([blog.getPublishedPost(db, slug), blog.nextScheduledPost(db)]);
  cacheLife(lifeUntil(next));
  return post;
}

export async function getFeedVariants() {
  "use cache";
  cacheLife("days");
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

/** Estado de una guía de Shalom u Olva (se consulta como mucho cada 15 minutos por guía; el webhook lo refresca antes). */
export async function getCourierTracking(courier: Courier, guideNumber: string, guideCode: string): Promise<CourierTracking | null> {
  "use cache";
  cacheTag(cacheTags.courierGuide(courier, guideNumber));
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
