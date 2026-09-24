import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { catalogUrl } from "@/lib/links";
import type { ProductCard } from "@/server/services/catalog";
import { promotionLabel } from "./price";

/** Promociones "N x S/" vigentes, armadas a partir de los productos que las tienen. */
export function PromoStrip({ products }: { products: ProductCard[] }) {
  const promos = new Map<string, { promotion: NonNullable<ProductCard["promotion"]>; names: string[] }>();
  for (const p of products) {
    if (!p.promotion || !p.inStock) continue;
    const entry = promos.get(p.promotion.id) ?? { promotion: p.promotion, names: [] };
    entry.names.push(p.name);
    promos.set(p.promotion.id, entry);
  }
  if (promos.size === 0) return null;

  return (
    <section aria-labelledby="promos" className="reveal mx-auto max-w-7xl 2xl:max-w-[96rem] py-6">
      <h2 id="promos" className="px-4 text-sm font-bold tracking-widest uppercase lg:px-6">
        Promos
      </h2>
      <ul className="no-scrollbar mt-4 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-4 px-4 lg:grid lg:grid-cols-4 lg:overflow-visible lg:px-6">
        {[...promos.values()].map(({ promotion, names }) => (
          <li key={promotion.id} className="w-64 shrink-0 snap-start lg:w-auto">
            <Link
              href={catalogUrl({ promo: promotion.id })}
              className="flex h-full flex-col justify-between rounded-xl bg-white p-5 text-black transition hover:-translate-y-0.5 hover:bg-sections active:scale-[0.98]"
            >
              <div>
                <p className="text-xs font-semibold tracking-widest uppercase">Lleva</p>
                <p className="mt-1 text-4xl leading-none font-extrabold tracking-tight">{promotionLabel(promotion)}</p>
                <p className="mt-3 line-clamp-2 text-sm text-black/70">
                  En {names.slice(0, 3).join(", ")}
                  {names.length > 3 ? ` y ${names.length - 3} más` : ""}
                </p>
              </div>
              <span className="mt-5 inline-flex items-center gap-1 text-sm font-semibold">
                Ver prendas <ArrowRight className="size-4" aria-hidden />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
