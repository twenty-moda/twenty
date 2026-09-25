import { ArrowRight } from "lucide-react";
import Link from "next/link";

/** Encabezado de las secciones de la portada: etiqueta chica (mono) y titular condensado. */
export function SectionHeading({ id, eyebrow, title, link }: { id: string; eyebrow?: string; title: string; link?: { href: string; label: string } }) {
  return (
    <div className="flex items-end justify-between gap-4 px-4 lg:px-6">
      <div className="min-w-0">
        {eyebrow ? <p className="font-mono text-[11px] font-semibold tracking-[0.14em] text-muted uppercase lg:text-xs">{eyebrow}</p> : null}
        <h2 id={id} className="mt-1.5 font-display text-[2.75rem] leading-[0.9] font-black text-balance uppercase lg:text-7xl">
          {title}
        </h2>
      </div>
      {link ? (
        <Link href={link.href} className="group inline-flex min-h-11 shrink-0 items-center gap-1.5 text-[13px] font-bold tracking-[0.06em] uppercase hover:text-muted">
          {link.label} <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
        </Link>
      ) : null}
    </div>
  );
}
