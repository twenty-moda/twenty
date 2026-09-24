import { ArrowRight } from "lucide-react";
import { getImageProps } from "next/image";
import Link from "next/link";
import type { Slide } from "@/server/services/content";

/**
 * Banner principal. Las imágenes actuales traen el texto dentro, así que en móvil se muestran completas
 * y en escritorio van al lado del titular. El H1 real es el `seoHeading` del banner.
 */
export function HomeHero({ slide }: { slide: Slide }) {
  const href = slide.href ?? "/catalogo";
  const common = { alt: slide.title } as const;
  const desktop = getImageProps({ ...common, src: slide.image, width: 1200, height: 1200, sizes: "50vw" }).props;
  const {
    props: { srcSet: mobileSrcSet, ...img },
  } = getImageProps({
    ...common,
    src: slide.imageMobile ?? slide.image,
    width: 1080,
    height: 1080,
    sizes: "100vw",
    loading: "eager",
    fetchPriority: "high",
  });

  return (
    <section className="mx-auto max-w-7xl 2xl:max-w-[96rem] md:grid md:grid-cols-2 md:items-center md:gap-10 md:px-6 md:py-10">
      <Link href={href} className="block overflow-hidden md:order-2 md:rounded-2xl" aria-label={slide.ctaLabel ?? slide.title}>
        <picture>
          <source media="(min-width: 768px)" srcSet={desktop.srcSet} sizes={desktop.sizes} />
          {/* Zoom suave al cargar: solo escala (no opacidad), así la foto se pinta de inmediato. */}
          <img {...img} srcSet={mobileSrcSet} alt={slide.title} className="aspect-square w-full animate-hero-zoom object-cover" />
        </picture>
      </Link>

      {/* El texto entra en secuencia: etiqueta, titular, descripción y botón. */}
      <div className="px-4 py-6 md:px-0">
        <p className="animate-fade-up text-xs font-semibold tracking-[0.3em] text-muted uppercase">{slide.title}</p>
        <h1 className="mt-3 display-title animate-fade-up font-extrabold tracking-tight text-balance uppercase [animation-delay:90ms]">
          {slide.seoHeading ?? "Moda urbana juvenil"}
        </h1>
        {slide.description ? <p className="mt-3 max-w-md animate-fade-up text-muted [animation-delay:180ms]">{slide.description}</p> : null}
        <Link
          href={href}
          className="group mt-6 inline-flex h-12 w-full animate-fade-up items-center justify-center gap-2 rounded-full bg-white px-8 text-sm font-semibold tracking-wide text-black uppercase transition-transform [animation-delay:270ms] active:scale-[0.97] md:w-auto"
        >
          {slide.ctaLabel?.replace(/[¡!]/g, "") || "Ver catálogo"}{" "}
          <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" aria-hidden />
        </Link>
      </div>
    </section>
  );
}
