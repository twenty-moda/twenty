import Image from "next/image";
import Link from "next/link";
import { catalogUrl } from "@/lib/links";
import type { CategoryLink } from "@/server/services/catalog";

/** Categorías como tarjetas deslizables en móvil y grilla en escritorio. */
export function CategoryRail({ categories }: { categories: CategoryLink[] }) {
  return (
    <section aria-labelledby="categorias" className="reveal mx-auto max-w-7xl 2xl:max-w-[96rem] py-6">
      <h2 id="categorias" className="px-4 text-sm font-bold tracking-widest uppercase lg:px-6">
        Compra por categoría
      </h2>
      <ul className="no-scrollbar mt-4 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-4 px-4 lg:grid lg:grid-cols-9 lg:overflow-visible lg:px-6">
        {categories.map((c) => (
          <li key={c.slug} className="w-28 shrink-0 snap-start lg:w-auto">
            <Link href={catalogUrl({ categoria: c.slug })} className="group block">
              <span className="relative block aspect-3/4 overflow-hidden rounded-lg bg-raised">
                {c.image ? (
                  <Image
                    src={c.image}
                    alt=""
                    fill
                    sizes="(min-width: 1024px) 11vw, 112px"
                    className="object-cover transition duration-500 group-hover:scale-105"
                  />
                ) : null}
              </span>
              <span className="mt-2 block text-center text-xs font-semibold tracking-wide uppercase">{c.name}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
