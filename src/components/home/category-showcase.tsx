import { ArrowUpRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { catalogUrl } from "@/lib/links";
import type { CategoryLink } from "@/server/services/catalog";
import { SectionHeading } from "./section-heading";

/** "Arma tu outfit": las categorías como fotos grandes en un carrusel que se desliza con el dedo. */
export function CategoryShowcase({ categories }: { categories: CategoryLink[] }) {
  if (categories.length === 0) return null;
  return (
    <section aria-labelledby="categorias" className="reveal mx-auto max-w-7xl py-8 lg:py-12 2xl:max-w-[96rem]">
      <SectionHeading
        id="categorias"
        eyebrow={`${categories.length} ${categories.length === 1 ? "categoría" : "categorías"}`}
        title="Arma tu outfit"
        link={{ href: "/catalogo", label: "Ver todo" }}
      />
      <ul className="no-scrollbar mt-5 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-4 px-4 lg:mt-7 lg:gap-4 lg:scroll-px-6 lg:px-6">
        {categories.map((c) => (
          <li key={c.slug} className="shrink-0 snap-start">
            <Link
              href={catalogUrl({ categoria: c.slug })}
              className="group relative block h-52 w-38 overflow-hidden rounded-2xl bg-raised active:scale-[0.98] lg:h-80 lg:w-60 lg:rounded-3xl"
            >
              {c.image ? (
                <Image src={c.image} alt="" fill sizes="(min-width: 1024px) 240px, 152px" className="object-cover transition duration-500 group-hover:scale-105" />
              ) : null}
              <span aria-hidden className="absolute inset-0 bg-linear-to-b from-transparent from-45% to-black/90" />
              <span className="absolute inset-x-3 bottom-2.5 flex items-end justify-between gap-1.5 lg:inset-x-4 lg:bottom-3.5">
                <span className="font-display text-2xl leading-[0.95] font-black uppercase lg:text-[2.125rem]">{c.name}</span>
                <ArrowUpRight className="size-5 shrink-0 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" aria-hidden />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
