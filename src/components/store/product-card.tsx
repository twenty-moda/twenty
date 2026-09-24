import Image from "next/image";
import Link from "next/link";
import { ViewTransition, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { ProductCard as ProductCardData } from "@/server/services/catalog";
import { Price, promotionLabel } from "./price";

type ProductCardProps = {
  product: ProductCardData;
  /** Las primeras tarjetas visibles cargan su foto de inmediato (LCP). */
  eager?: boolean;
  sizes?: string;
  className?: string;
  /** La foto "vuela" hasta la ficha al abrirla. Solo si el producto aparece una vez en la página (el nombre debe ser único). */
  morph?: boolean;
};

/** Nombre compartido entre la foto de la tarjeta y la galería de la ficha. */
export const productMorphName = (slug: string) => `product-${slug}`;

function Morph({ name, enabled, children }: { name: string; enabled: boolean; children: ReactNode }) {
  return enabled ? (
    <ViewTransition name={name} share="morph" default="none">
      {children}
    </ViewTransition>
  ) : (
    children
  );
}

export function ProductCard({ product, eager = false, sizes = "(min-width: 1024px) 25vw, (min-width: 768px) 33vw, 50vw", className, morph = false }: ProductCardProps) {
  const colorCount = product.colors.length;
  return (
    <article className={cn("group relative", className)}>
      {/* prefetch: trae la ficha completa (es estática, sale del CDN): se abre al instante y la foto puede "volar". */}
      <Link href={`/product/${product.slug}`} prefetch className="block transition-transform duration-200 focus-visible:outline-offset-4 active:scale-[0.98]">
        <Morph name={productMorphName(product.slug)} enabled={morph}>
          <div className="relative aspect-3/4 overflow-hidden rounded-lg bg-raised">
            {product.image ? (
              <Image
                src={product.image.path}
                alt={product.image.alt}
                fill
                sizes={sizes}
                loading={eager ? "eager" : "lazy"}
                className={cn(
                  "object-cover transition duration-700 ease-out md:group-hover:scale-[1.04]",
                  product.hoverImage && "md:group-hover:opacity-0",
                  !product.inStock && "opacity-50",
                )}
              />
            ) : null}
            {product.hoverImage ? (
              <Image
                src={product.hoverImage.path}
                alt=""
                fill
                sizes={sizes}
                className="hidden object-cover opacity-0 transition duration-700 ease-out md:block md:group-hover:scale-[1.04] md:group-hover:opacity-100"
              />
            ) : null}

            <div className="absolute top-2 left-2 flex flex-col items-start gap-1">
              {!product.inStock ? (
                <span className="rounded bg-white px-2 py-1 text-[11px] font-bold tracking-wide text-black uppercase">Agotado</span>
              ) : product.promotion ? (
                <span className="rounded bg-white px-2 py-1 text-[11px] font-bold tracking-wide text-black uppercase">
                  {promotionLabel(product.promotion)}
                </span>
              ) : null}
            </div>
          </div>
        </Morph>

        <div className="mt-2.5 space-y-1 px-0.5">
          <h3 className="line-clamp-2 text-sm leading-snug">{product.name}</h3>
          <Price priceCents={product.priceCents} compareAtPriceCents={product.compareAtPriceCents} from={product.hasPriceRange} />
          {colorCount > 1 ? <p className="text-xs text-subtle">{colorCount} colores</p> : null}
        </div>
      </Link>
    </article>
  );
}
