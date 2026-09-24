import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Encabezado de las páginas de contenido (Nosotros, Blog, Contacto, legales…). */
export function PageHeader({ eyebrow, title, description, className, children }: { eyebrow?: string; title: string; description?: ReactNode; className?: string; children?: ReactNode }) {
  return (
    <header className={cn("mx-auto max-w-3xl px-4 pt-10 pb-6 text-center md:pt-14", className)}>
      {eyebrow ? (
        <p className="mb-3 inline-flex rounded-full border border-line px-3 py-1 text-[11px] font-bold tracking-widest text-muted uppercase">{eyebrow}</p>
      ) : null}
      <h1 className="display-title font-extrabold tracking-tight text-balance uppercase">{title}</h1>
      {description ? <p className="mx-auto mt-4 max-w-xl text-pretty text-muted">{description}</p> : null}
      {children}
    </header>
  );
}
