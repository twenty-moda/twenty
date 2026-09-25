import { ArrowDown } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { promotionLabel } from "@/components/store/price";
import { ProductCard } from "@/components/store/product-card";
import { PromoCard, promoProductNames } from "@/components/store/promo-strip";
import { promoSections } from "@/lib/promos";
import type { ProductCard as ProductCardData } from "@/server/services/catalog";
import { getProductCards } from "../_data";

const DISCOUNTS_ID = "descuentos";
const sectionId = (promotionId: string) => `promo-${promotionId}`;

export async function generateMetadata(): Promise<Metadata> {
  const { bundles } = promoSections(await getProductCards());
  const labels = [...new Set(bundles.map((b) => promotionLabel(b.promotion)))];
  return {
    title: "Promos",
    description: `Promos de TWENTY${labels.length ? `: ${labels.join(", ")}` : ""} y prendas con descuento. Combina colores y tallas.`,
    alternates: { canonical: "/promos" },
  };
}

/** Todas las promos en una página: arriba una tarjeta por promo (baja a su sección) y abajo las prendas de cada una. */
export default async function PromosPage() {
  const { bundles, discounted, maxDiscountPercent, productCount } = promoSections(await getProductCards());

  return (
    <div className="mx-auto max-w-7xl pb-6 2xl:max-w-[96rem]">
      <div className="px-4 pt-6 lg:px-6">
        <h1 className="text-2xl font-extrabold tracking-tight uppercase md:text-3xl">Promos</h1>
        <p className="mt-1 text-sm text-muted">
          {productCount} {productCount === 1 ? "prenda" : "prendas"}
        </p>
      </div>

      {productCount === 0 ? (
        <div className="px-4 py-20 text-center">
          <p className="font-semibold">Por ahora no hay promos activas</p>
          <p className="mt-1 text-sm text-muted">Suscríbete abajo y te avisamos de la próxima.</p>
          <Link href="/catalogo" className="mt-6 inline-flex h-12 items-center rounded-full bg-white px-8 text-sm font-semibold text-black">
            Ver el catálogo
          </Link>
        </div>
      ) : (
        <>
          <nav aria-label="Promociones">
            <ul className="no-scrollbar mt-4 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-4 px-4 lg:grid lg:grid-cols-3 lg:overflow-visible lg:px-6">
              {bundles.map(({ promotion, products }) => (
                <li key={promotion.id} className="w-64 shrink-0 snap-start lg:w-auto">
                  <PromoCard href={`#${sectionId(promotion.id)}`} eyebrow="Lleva" title={promotionLabel(promotion)} detail={promoProductNames(products)} cta={<SeeItems />} />
                </li>
              ))}
              {discounted.length ? (
                <li className="w-64 shrink-0 snap-start lg:w-auto">
                  <PromoCard
                    href={`#${DISCOUNTS_ID}`}
                    eyebrow={maxDiscountPercent ? "Hasta" : "Prendas"}
                    title={maxDiscountPercent ? `-${maxDiscountPercent}%` : "Rebajadas"}
                    titleClassName="text-danger"
                    detail={promoProductNames(discounted)}
                    cta={<SeeItems />}
                  />
                </li>
              ) : null}
            </ul>
          </nav>

          {bundles.map(({ promotion, products }, i) => (
            <PromoSection
              key={promotion.id}
              id={sectionId(promotion.id)}
              eyebrow="Lleva"
              title={promotionLabel(promotion)}
              detail={`${products.length > 1 ? "Combina modelos, colores y tallas" : "Combina colores y tallas"} · ${countLabel(products.length)}`}
              products={products}
              eager={i === 0}
            />
          ))}
          {discounted.length ? (
            <PromoSection
              id={DISCOUNTS_ID}
              eyebrow="Rebajas"
              title="Con descuento"
              detail={`${maxDiscountPercent ? `Hasta -${maxDiscountPercent}% · ` : ""}${countLabel(discounted.length)}`}
              products={discounted}
              eager={bundles.length === 0}
            />
          ) : null}
        </>
      )}
    </div>
  );
}

const countLabel = (n: number) => `${n} ${n === 1 ? "prenda" : "prendas"}`;

function SeeItems() {
  return (
    <>
      Ver prendas <ArrowDown className="size-4" aria-hidden />
    </>
  );
}

type PromoSectionProps = { id: string; eyebrow: string; title: string; detail: ReactNode; products: ProductCardData[]; eager: boolean };

function PromoSection({ id, eyebrow, title, detail, products, eager }: PromoSectionProps) {
  return (
    <section id={id} aria-labelledby={`${id}-titulo`} className="pt-10">
      <div className="px-4 lg:px-6">
        <p className="text-xs font-semibold tracking-widest text-muted uppercase">{eyebrow}</p>
        <h2 id={`${id}-titulo`} className="mt-1 text-3xl leading-none font-extrabold tracking-tight">
          {title}
        </h2>
        <p className="mt-2 text-sm text-muted">{detail}</p>
      </div>
      {/* Cada prenda sale una sola vez en la página (promoSections), así que la foto puede "volar" a la ficha. */}
      <ul className="grid grid-cols-2 gap-x-3 gap-y-7 px-4 pt-4 md:grid-cols-3 lg:grid-cols-4 lg:gap-x-4 lg:px-6 2xl:grid-cols-5">
        {products.map((product, i) => (
          <li key={product.id} className="reveal">
            <ProductCard product={product} eager={eager && i < 2} morph sizes="(min-width: 1536px) 20vw, (min-width: 1024px) 25vw, (min-width: 768px) 33vw, 50vw" />
          </li>
        ))}
      </ul>
    </section>
  );
}
