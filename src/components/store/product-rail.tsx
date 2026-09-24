import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import type { ProductCard as ProductCardData } from "@/server/services/catalog";
import { ProductCard } from "./product-card";

type ProductRailProps = {
  title: string;
  products: ProductCardData[];
  href?: string;
  /** "grid": 2 columnas en móvil. "rail": carrusel deslizable en móvil. */
  layout?: "grid" | "rail";
  /** Las fotos "vuelan" a la ficha (ver ProductCard). Solo si estos productos no se repiten en la página. */
  morph?: boolean;
};

export function ProductRail({ title, products, href, layout = "grid", morph = false }: ProductRailProps) {
  if (products.length === 0) return null;
  const id = `seccion-${title.toLowerCase().replace(/\s+/g, "-")}`;
  return (
    <section aria-labelledby={id} className={cn("mx-auto max-w-7xl 2xl:max-w-[96rem] py-6", layout === "rail" && "reveal")}>
      <div className="flex items-end justify-between px-4 lg:px-6">
        <h2 id={id} className="text-sm font-bold tracking-widest uppercase">
          {title}
        </h2>
        {href ? (
          <Link href={href} className="-my-2 inline-flex min-h-10 items-center gap-1 text-sm text-muted hover:text-white">
            Ver todo <ArrowRight className="size-4" aria-hidden />
          </Link>
        ) : null}
      </div>
      {layout === "rail" ? (
        <ul className="no-scrollbar mt-4 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-4 px-4 lg:grid lg:grid-cols-4 lg:gap-x-4 lg:overflow-visible lg:px-6">
          {products.map((p) => (
            <li key={p.id} className="w-[44vw] max-w-56 shrink-0 snap-start lg:w-auto lg:max-w-none">
              <ProductCard product={p} sizes="(min-width: 1024px) 25vw, 44vw" morph={morph} />
            </li>
          ))}
        </ul>
      ) : (
        <ul className="mt-4 grid grid-cols-2 gap-x-3 gap-y-7 px-4 md:grid-cols-3 lg:grid-cols-4 lg:gap-x-4 lg:px-6">
          {products.map((p, i) => (
            <li key={p.id} className="reveal">
              <ProductCard product={p} eager={i < 2} morph={morph} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
