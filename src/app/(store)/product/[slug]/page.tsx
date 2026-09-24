import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { Suspense } from "react";
import { ProductDetails } from "@/components/product/product-details";
import { ProductExperience } from "@/components/product/product-experience";
import { JsonLd } from "@/components/store/json-ld";
import { ProductRail } from "@/components/store/product-rail";
import { absoluteMediaUrl, catalogUrl, siteUrl } from "@/lib/links";
import { getLegacyProductUrl, getProduct, getProductCards, getProductSlugs, getSiteSettings } from "../../_data";

export async function generateStaticParams() {
  const slugs = await getProductSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps<"/product/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProduct(slug);
  if (!product) return { title: "Producto no encontrado", robots: { index: false } };
  const image = product.colors[0]?.images[0];
  const description =
    product.metaDescription ??
    [product.description, `${product.category.name}${product.fit ? ` ${product.fit.name}` : ""} de TWENTY. Envío en 24 a 48 horas en Lima.`]
      .filter(Boolean)
      .join(". ");
  return {
    title: product.metaTitle ?? product.name,
    description,
    alternates: { canonical: `/product/${product.slug}` },
    openGraph: { type: "website", title: product.name, description, images: image ? [{ url: absoluteMediaUrl(image.path), alt: image.alt }] : [] },
  };
}

export default function ProductPage({ params }: PageProps<"/product/[slug]">) {
  return (
    <Suspense fallback={<ProductSkeleton />}>
      <ProductContent params={params} />
    </Suspense>
  );
}

async function ProductContent({ params }: Pick<PageProps<"/product/[slug]">, "params">) {
  const { slug } = await params;
  const product = await getProduct(slug);
  if (!product) {
    // URLs de la plataforma anterior (variantes y sitemap viejo): 308 al producto con la variante elegida.
    const legacy = await getLegacyProductUrl(slug);
    if (legacy) permanentRedirect(legacy);
    notFound();
  }

  const [cards, settings] = await Promise.all([getProductCards(), getSiteSettings()]);
  const related = cards.filter((c) => c.category.slug === product.category.slug && c.id !== product.id && c.inStock).slice(0, 8);
  const prices = product.variants.map((v) => v.priceCents / 100);
  const url = `${siteUrl()}/product/${product.slug}`;
  const breadcrumbs = [
    { href: "/catalogo", label: "Catálogo" },
    { href: catalogUrl({ categoria: product.category.slug }), label: product.category.name },
    ...(product.fit ? [{ href: catalogUrl({ categoria: product.category.slug, fit: product.fit.slug }), label: product.fit.name }] : []),
  ];

  return (
    <>
      <ProductExperience
        product={product}
        whatsapp={settings.contact.whatsapp}
        breadcrumbs={breadcrumbs}
        details={<ProductDetails description={product.description} shipping={settings.productInfo.shipping} returns={settings.productInfo.returns} />}
      />

      <ProductRail title="También te puede gustar" products={related} href={catalogUrl({ categoria: product.category.slug })} layout="rail" morph />

      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Product",
          name: product.name,
          description: product.description ?? undefined,
          image: product.colors.flatMap((c) => c.images.slice(0, 1)).map((i) => absoluteMediaUrl(i.path)),
          sku: product.variants[0]?.sku,
          brand: { "@type": "Brand", name: "TWENTY" },
          category: product.category.name,
          offers: {
            "@type": "AggregateOffer",
            url,
            priceCurrency: "PEN",
            lowPrice: Math.min(...prices),
            highPrice: Math.max(...prices),
            offerCount: product.variants.length,
            availability: product.variants.some((v) => v.stock > 0) ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
          },
        }}
      />
    </>
  );
}

function ProductSkeleton() {
  return (
    <div className="mx-auto max-w-7xl animate-pulse md:grid md:grid-cols-2 md:gap-8 md:px-6 md:pt-6 lg:grid-cols-[3fr_2fr] lg:gap-10 2xl:max-w-[96rem]" aria-busy="true" aria-label="Cargando producto">
      <div className="aspect-3/4 bg-raised md:rounded-lg" />
      <div className="space-y-4 px-4 pt-5 md:px-0">
        <div className="h-3 w-32 rounded bg-raised" />
        <div className="h-6 w-3/4 rounded bg-raised" />
        <div className="h-7 w-24 rounded bg-raised" />
        <div className="grid grid-cols-5 gap-2 pt-4">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="h-12 rounded-lg bg-raised" />
          ))}
        </div>
      </div>
    </div>
  );
}
