import type { Metadata } from "next";
import { CategoryShowcase } from "@/components/home/category-showcase";
import { ComboBanner } from "@/components/home/combo-banner";
import { Community } from "@/components/home/community";
import { toFeaturedItem } from "@/components/home/featured-data";
import { FeaturedGrid } from "@/components/home/featured-grid";
import { FitList } from "@/components/home/fit-list";
import { displayFont, monoFont } from "@/components/home/fonts";
import { HomeHero } from "@/components/home/hero";
import { Perks } from "@/components/home/perks";
import { PromoTapes } from "@/components/home/promo-tapes";
import { StoreMapCard } from "@/components/home/store-map-card";
import { JsonLd } from "@/components/store/json-ld";
import { promotionLabel } from "@/components/store/price";
import { siteUrl } from "@/lib/links";
import { promoSections } from "@/lib/promos";
import { getCategoryLinks, getProductCards, getSiteSettings, getSlides } from "./_data";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

const SCHEMA_DAYS: Record<string, string> = {
  Lunes: "Monday",
  Martes: "Tuesday",
  Miércoles: "Wednesday",
  Jueves: "Thursday",
  Viernes: "Friday",
  Sábado: "Saturday",
  Domingo: "Sunday",
};

/** Prendas para la grilla "Lo más buscado" (y sus filtros): los destacados primero. */
const FEATURED_POOL = 36;
const MAX_FITS = 8;

/**
 * Portada con el diseño urbano "B": negro, blanco y cromo, y el amarillo solo para las ofertas.
 * Todo sale de la BD: el banner del admin, las promos vigentes, las categorías, los cortes y la tienda.
 * La barra, el menú y el pie son los del layout (no se tocan aquí).
 */
export default async function HomePage() {
  const [slides, categories, products, settings] = await Promise.all([getSlides(), getCategoryLinks(), getProductCards(), getSiteSettings()]);
  const inStock = products.filter((p) => p.inStock);
  const pool = [...inStock.filter((p) => p.isFeatured), ...inStock.filter((p) => !p.isFeatured)].slice(0, FEATURED_POOL);
  const promos = promoSections(products);
  const combo = promos.bundles[0];
  const { store, contact } = settings;

  const slide = slides[0];
  const heroHref = slide?.href?.split(/[?#]/)[0];
  const heroProduct = heroHref?.startsWith("/product/") ? inStock.find((p) => `/product/${p.slug}` === heroHref) : undefined;

  // La cinta amarilla: cada promo "N x S/" (con su categoría si es una sola) y el mayor descuento.
  const offers = [
    ...promos.bundles.map(({ promotion, products: items }) => {
      const names = new Set(items.map((p) => p.category.name));
      return names.size === 1 ? `${[...names][0]} ${promotionLabel(promotion)}` : promotionLabel(promotion);
    }),
    ...(promos.maxDiscountPercent ? [`Hasta -${promos.maxDiscountPercent}%`] : []),
  ];

  const fitCounts = new Map<string, { slug: string; name: string; count: number }>();
  for (const p of inStock) {
    if (!p.fit) continue;
    const current = fitCounts.get(p.fit.slug) ?? { ...p.fit, count: 0 };
    fitCounts.set(p.fit.slug, { ...current, count: current.count + 1 });
  }
  const fits = [...fitCounts.values()].sort((a, b) => b.count - a.count).slice(0, MAX_FITS);
  const communityPhotos = categories
    .map((c) => c.image)
    .filter((image): image is string => !!image)
    .slice(-4);

  return (
    <div className={`${displayFont.variable} ${monoFont.variable}`}>
      {slide ? <HomeHero slide={slide} product={heroProduct} combo={combo} hasPromos={promos.productCount > 0} /> : null}
      <PromoTapes offers={[...new Set(offers)]} />
      <CategoryShowcase categories={categories} />
      <FeaturedGrid items={pool.map(toFeaturedItem)} />
      {combo ? <ComboBanner combo={combo} /> : null}
      <div className="mx-auto max-w-7xl lg:grid lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:gap-4 lg:py-12 2xl:max-w-[96rem]">
        <FitList fits={fits} />
        {store ? <StoreMapCard store={store} contact={contact} /> : null}
      </div>
      <Perks />
      <Community socials={settings.socials} photos={communityPhotos} />

      {store ? (
        <JsonLd
          data={{
            "@context": "https://schema.org",
            "@type": "ClothingStore",
            name: "TWENTY",
            url: siteUrl(),
            logo: `${siteUrl()}/brand/twenty-logo.webp`,
            telephone: contact.phone || undefined,
            email: contact.email || undefined,
            address: { "@type": "PostalAddress", streetAddress: store.address, addressLocality: "Lima", addressCountry: "PE" },
            geo: { "@type": "GeoCoordinates", latitude: store.latitude, longitude: store.longitude },
            openingHoursSpecification: store.hours
              .filter((h) => !h.closed)
              .map((h) => ({ "@type": "OpeningHoursSpecification", dayOfWeek: SCHEMA_DAYS[h.day] ?? h.day, opens: h.open, closes: h.close })),
            sameAs: settings.socials.map((s) => s.url),
          }}
        />
      ) : null}
    </div>
  );
}
