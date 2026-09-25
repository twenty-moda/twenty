import { ArrowRight } from "lucide-react";
import { getImageProps } from "next/image";
import Link from "next/link";
import { Fragment } from "react";
import { cn } from "@/lib/cn";
import { catalogUrl } from "@/lib/links";
import { formatPrice } from "@/lib/money";
import type { PromoGroup } from "@/lib/promos";
import type { ProductCard } from "@/server/services/catalog";
import type { Slide } from "@/server/services/content";
import { promotionLabel } from "../store/price";

type HomeHeroProps = {
  slide: Slide;
  /** El banner enlaza a una prenda: una etiqueta con su precio late sobre la foto. */
  product?: ProductCard;
  /** La primera promo "N x S/": sticker amarillo sobre la foto (tablet y computadora). */
  combo?: PromoGroup;
  hasPromos: boolean;
};

/**
 * Hero de la portada. En el teléfono la foto ocupa la pantalla y el texto va encima; desde tablet, el texto a la
 * izquierda y la foto a la derecha. Todo sale del banner del admin: la foto (sin texto encima), la etiqueta
 * (`title`), el titular (`seoHeading`, la última palabra en contorno), el texto y el botón.
 */
export function HomeHero({ slide, product, combo, hasPromos }: HomeHeroProps) {
  const href = slide.href || "/catalogo";
  const words = (slide.seoHeading || slide.title || "Moda urbana juvenil").trim().split(/\s+/);
  const {
    props: { srcSet: mobileSrcSet, ...img },
  } = getImageProps({
    src: slide.imageMobile ?? slide.image,
    alt: slide.title,
    width: 1080,
    height: 1350,
    sizes: "100vw",
    loading: "eager",
    fetchPriority: "high",
  });
  const desktop = getImageProps({ src: slide.image, alt: slide.title, width: 1200, height: 1500, sizes: "(min-width: 1536px) 720px, 48vw" }).props;
  const cta = slide.ctaLabel?.replace(/[¡!]/g, "").trim() || "Ver lo nuevo";

  return (
    <section
      aria-label={slide.title}
      className="relative isolate overflow-hidden md:mx-auto md:grid md:max-w-7xl md:grid-cols-2 md:items-end md:gap-10 md:px-6 md:py-10 lg:gap-14 2xl:max-w-[96rem]"
    >
      <div className="absolute inset-0 -z-10 bg-raised md:relative md:inset-auto md:z-0 md:order-2 md:aspect-4/5 md:overflow-hidden md:rounded-3xl">
        <picture>
          <source media="(min-width: 768px)" srcSet={desktop.srcSet} sizes={desktop.sizes} />
          <img {...img} srcSet={mobileSrcSet} alt={slide.title} className="size-full animate-hero-zoom object-cover object-[50%_20%]" />
        </picture>
        {/* Oscurece la parte de abajo para que el texto se lea sobre la foto (solo en el teléfono). */}
        <div aria-hidden className="absolute inset-0 bg-linear-to-b from-black/30 via-transparent via-30% to-black md:hidden" />
        {product ? <ProductTag product={product} /> : null}
        {combo ? <ComboSticker combo={combo} /> : null}
      </div>

      {/* pb-24 en el teléfono: los botones quedan por encima del botón flotante de WhatsApp. */}
      <div className="flex min-h-[max(560px,min(820px,calc(100svh-6rem)))] flex-col justify-end gap-4 px-5 pt-40 pb-24 md:min-h-0 md:gap-6 md:px-0 md:pt-0 md:pb-6">
        <p className="inline-flex animate-fade-up items-center gap-2 self-start rounded-full border border-white/20 bg-black/60 px-3 py-1.5 font-mono text-[11px] font-semibold tracking-widest uppercase backdrop-blur-sm md:text-xs">
          <span aria-hidden className="size-1.5 animate-blink rounded-full bg-white" />
          {slide.title}
        </p>
        <h1 className="font-display text-[clamp(4rem,23vw,6rem)] leading-[0.84] font-black uppercase md:text-[clamp(5rem,9.5vw,10.5rem)]">
          {words.map((word, i) => (
            <Fragment key={i}>
              {/* La máscara deja espacio arriba para las tildes (Á, Ñ) del texto en mayúsculas. */}
              <span className="-mt-[0.16em] inline-block overflow-hidden pt-[0.16em] align-bottom">
                <span className={cn("inline-block animate-rise", i === words.length - 1 && words.length > 1 && "text-outline md:[-webkit-text-stroke-width:3px]")} style={{ animationDelay: `${80 + i * 90}ms` }}>
                  {word}
                </span>
              </span>
              {i < words.length - 1 ? " " : null}
            </Fragment>
          ))}
        </h1>
        {slide.description ? <p className="max-w-sm animate-fade-up text-base leading-relaxed text-white/80 [animation-delay:450ms] md:max-w-md md:text-lg">{slide.description}</p> : null}
        <div className="flex animate-fade-up gap-2.5 [animation-delay:600ms]">
          <Link
            href={href}
            className="group inline-flex h-13 flex-1 items-center justify-center gap-2 rounded-full bg-white px-6 text-sm font-extrabold tracking-[0.06em] text-black uppercase transition-transform active:scale-[0.97] md:flex-none md:px-9"
          >
            {cta} <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" aria-hidden />
          </Link>
          {hasPromos ? (
            <Link
              href="/promos"
              className="inline-flex h-13 items-center rounded-full border-[1.5px] border-offer px-6 text-sm font-bold tracking-[0.04em] text-offer uppercase transition-colors hover:bg-offer hover:text-black"
            >
              Promos
            </Link>
          ) : null}
        </div>
      </div>
    </section>
  );
}

/** Etiqueta que late sobre la foto con la prenda del banner. Amarilla solo si está rebajada (oferta). */
function ProductTag({ product }: { product: ProductCard }) {
  const onSale = !!product.compareAtPriceCents && !product.outfit;
  return (
    <Link
      href={`/product/${product.slug}`}
      className="absolute top-[34%] left-[30%] flex animate-fade-up items-center gap-2 [animation-delay:700ms] md:top-[38%] md:left-[24%]"
    >
      <span aria-hidden className={cn("size-3.5 shrink-0 animate-ping-ring rounded-full border-[3px] border-black", onSale ? "bg-offer text-offer" : "bg-white text-white")} />
      <span className="flex flex-col rounded-xl border border-white/20 bg-black/80 px-2.5 py-1.5 backdrop-blur-sm">
        <span className="text-xs font-bold">{product.name}</span>
        <span className="font-mono text-[11px]">
          <span className={onSale ? "text-offer" : undefined}>{formatPrice(product.priceCents)}</span>
          {onSale ? <s className="ml-1.5 text-muted">{formatPrice(product.compareAtPriceCents!)}</s> : null}
        </span>
      </span>
    </Link>
  );
}

function ComboSticker({ combo }: { combo: PromoGroup }) {
  return (
    <Link
      href={catalogUrl({ promo: combo.promotion.id })}
      className="absolute bottom-4 left-4 hidden w-40 flex-col gap-1 overflow-hidden rounded-2xl bg-offer p-4 text-black shadow-2xl shadow-black/60 transition-transform hover:-rotate-2 md:flex lg:bottom-6 lg:left-6 lg:w-56 lg:rounded-3xl lg:p-5"
    >
      <svg aria-hidden viewBox="0 0 120 120" className="pointer-events-none absolute -top-6 -right-6 size-28 animate-spin-slow opacity-20">
        <defs>
          <path id="combo-circle" d="M60 60m-44 0a44 44 0 1 1 88 0a44 44 0 1 1-88 0" />
        </defs>
        <text className="fill-black font-mono text-[11px] font-semibold tracking-[3px]">
          <textPath href="#combo-circle">TWENTY · GAMARRA · LIMA · PERÚ ·</textPath>
        </text>
      </svg>
      <span className="font-mono text-[11px] font-semibold tracking-[0.14em] uppercase">Combo</span>
      <span className="font-display text-4xl leading-[0.85] font-black whitespace-pre-line uppercase lg:text-5xl">{promotionLabel(combo.promotion).replace(" x ", " x\n")}</span>
      <span className="text-[11px] leading-snug font-medium lg:text-xs">El descuento se aplica solo en el carrito.</span>
    </Link>
  );
}
