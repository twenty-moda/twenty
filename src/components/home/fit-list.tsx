import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { catalogUrl } from "@/lib/links";
import { SectionHeading } from "./section-heading";

/** "Encuentra tu fit": los cortes con más prendas, en letras grandes (uno lleno, uno en contorno). */
export function FitList({ fits }: { fits: { slug: string; name: string }[] }) {
  if (fits.length === 0) return null;
  return (
    <section aria-labelledby="fits" className="reveal min-w-0 py-8 lg:py-0">
      <SectionHeading id="fits" eyebrow="Por corte" title="Encuentra tu fit" />
      <nav aria-label="Cortes" className="mt-5 grid grid-cols-1 border-t border-line px-4 lg:grid-cols-2 lg:gap-x-8 lg:px-6">
        {fits.map((fit, i) => (
          <Link
            key={fit.slug}
            href={catalogUrl({ fit: fit.slug })}
            className="group flex min-h-15 items-center justify-between gap-3 border-b border-line transition-[padding] hover:pl-3 lg:min-h-19"
          >
            {/* Uno lleno y uno en contorno (en la computadora: la columna izquierda llena, la derecha en contorno). */}
            <span className={cn("font-display text-[2.375rem] leading-none font-black uppercase lg:text-5xl", i % 2 === 1 && "text-outline [-webkit-text-stroke-width:1.5px] lg:[-webkit-text-stroke-width:2px]")}>
              {fit.name}
            </span>
            <ArrowUpRight className="size-6 shrink-0 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" aria-hidden />
          </Link>
        ))}
      </nav>
    </section>
  );
}
