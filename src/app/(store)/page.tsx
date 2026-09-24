import type { Metadata } from "next";
import { Benefits } from "@/components/store/benefits";
import { CategoryRail } from "@/components/store/category-rail";
import { HomeHero } from "@/components/store/home-hero";
import { JsonLd } from "@/components/store/json-ld";
import { ProductRail } from "@/components/store/product-rail";
import { PromoStrip } from "@/components/store/promo-strip";
import { StoreCard } from "@/components/store/store-card";
import { siteUrl } from "@/lib/links";
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

export default async function HomePage() {
  const [slides, categories, products, settings] = await Promise.all([getSlides(), getCategoryLinks(), getProductCards(), getSiteSettings()]);
  const inStock = products.filter((p) => p.inStock);
  const featured = [...inStock.filter((p) => p.isFeatured), ...inStock.filter((p) => !p.isFeatured)].slice(0, 8);
  const featuredIds = new Set(featured.map((p) => p.id));
  const more = inStock.filter((p) => !featuredIds.has(p.id)).slice(0, 8);
  const { store, contact } = settings;

  return (
    <>
      {slides[0] ? <HomeHero slide={slides[0]} /> : null}
      <CategoryRail categories={categories} />
      <ProductRail title="Destacados" products={featured} href="/catalogo" morph />
      <PromoStrip products={products} />
      <ProductRail title="Más para ti" products={more} href="/catalogo" layout="rail" morph />
      <Benefits />
      {store ? <StoreCard store={store} contact={contact} /> : null}

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
    </>
  );
}
