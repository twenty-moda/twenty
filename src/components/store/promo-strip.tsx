import { ArrowRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { catalogUrl } from "@/lib/links";
import { promoSections } from "@/lib/promos";
import type { ProductCard } from "@/server/services/catalog";
import { promotionLabel } from "./price";

/** "En Polo Boxi Fit 99, Polo Regular Fit, Polo Slim Fit y 6 más". */
export function promoProductNames(products: { name: string }[]) {
  const names = products.map((p) => p.name);
  return `En ${names.slice(0, 3).join(", ")}${names.length > 3 ? ` y ${names.length - 3} más` : ""}`;
}

type PromoCardProps = { href: string; eyebrow: string; title: string; detail: string; cta: ReactNode; titleClassName?: string };

/** Tarjeta blanca de promo ("Lleva 2 x S/ 100"). En el home lleva al catálogo; en /promos, a su sección. */
export function PromoCard({ href, eyebrow, title, detail, cta, titleClassName }: PromoCardProps) {
  return (
    <Link
      href={href}
      className="flex h-full flex-col justify-between rounded-xl bg-white p-5 text-black transition hover:-translate-y-0.5 hover:bg-sections active:scale-[0.98]"
    >
      <div>
        <p className="text-xs font-semibold tracking-widest uppercase">{eyebrow}</p>
        <p className={cn("mt-1 text-4xl leading-none font-extrabold tracking-tight", titleClassName)}>{title}</p>
        <p className="mt-3 line-clamp-2 text-sm text-black/70">{detail}</p>
      </div>
      <span className="mt-5 inline-flex items-center gap-1 text-sm font-semibold">{cta}</span>
    </Link>
  );
}

/** Promociones "N x S/" vigentes, armadas a partir de los productos que las tienen. */
export function PromoStrip({ products }: { products: ProductCard[] }) {
  const { bundles } = promoSections(products);
  if (bundles.length === 0) return null;

  return (
    <section aria-labelledby="promos" className="reveal mx-auto max-w-7xl 2xl:max-w-[96rem] py-6">
      <div className="flex items-end justify-between px-4 lg:px-6">
        <h2 id="promos" className="text-sm font-bold tracking-widest uppercase">
          Promos
        </h2>
        <Link href="/promos" className="-my-2 inline-flex min-h-10 items-center gap-1 text-sm text-muted hover:text-white">
          Ver todas <ArrowRight className="size-4" aria-hidden />
        </Link>
      </div>
      <ul className="no-scrollbar mt-4 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-4 px-4 lg:grid lg:grid-cols-4 lg:overflow-visible lg:px-6">
        {bundles.map(({ promotion, products: items }) => (
          <li key={promotion.id} className="w-64 shrink-0 snap-start lg:w-auto">
            <PromoCard
              href={catalogUrl({ promo: promotion.id })}
              eyebrow="Lleva"
              title={promotionLabel(promotion)}
              detail={promoProductNames(items)}
              cta={
                <>
                  Ver prendas <ArrowRight className="size-4" aria-hidden />
                </>
              }
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
