"use client";

import { ArrowRight, ChevronDown } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { catalogUrl } from "@/lib/links";
import type { CategoryLink } from "@/server/services/catalog";

/**
 * "Catálogo" de la barra de escritorio: con el mouse o el teclado abre un panel con las categorías y sus fotos.
 * Tocarlo (tablet) lleva a /catalogo, donde están las mismas categorías como filtro.
 */
export function CatalogMenu({ categories }: { categories: CategoryLink[] }) {
  const [open, setOpen] = useState(false);
  // Las fotos se piden la primera vez que se abre, no en cada página.
  const [opened, setOpened] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const triggerRef = useRef<HTMLAnchorElement>(null);

  const show = () => {
    clearTimeout(closeTimer.current);
    setOpen(true);
    setOpened(true);
  };
  const close = () => {
    clearTimeout(closeTimer.current);
    setOpen(false);
  };
  // Un respiro al salir: al pasar del enlace al panel el mouse cruza el borde del header.
  const closeSoon = () => {
    clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpen(false), 150);
  };
  useEffect(() => () => clearTimeout(closeTimer.current), []);

  return (
    <li
      onMouseEnter={show}
      onMouseLeave={closeSoon}
      onFocus={show}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) close();
      }}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || !open) return;
        triggerRef.current?.focus();
        close();
      }}
    >
      <Link
        ref={triggerRef}
        href="/catalogo"
        onClick={close}
        aria-expanded={open}
        aria-controls="menu-catalogo"
        className="flex h-14 items-center gap-1 hover:text-muted"
      >
        Catálogo <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} aria-hidden />
      </Link>

      <div
        id="menu-catalogo"
        className={cn(
          "absolute inset-x-0 top-full border-b border-line bg-ink transition duration-200 motion-reduce:transition-none",
          open ? "visible translate-y-0 opacity-100" : "invisible -translate-y-1 opacity-0",
        )}
      >
        <div className="mx-auto max-w-7xl px-6 pt-5 pb-7 2xl:max-w-[96rem]">
          <Link href="/catalogo" onClick={close} className="inline-flex min-h-10 items-center gap-1 hover:text-muted">
            Ver todo el catálogo <ArrowRight className="size-4" aria-hidden />
          </Link>
          {/* Una sola fila: cada categoría mide hasta 8rem y se achica si no entran todas. */}
          <ul className="mt-3 grid auto-cols-[minmax(0,8rem)] grid-flow-col gap-4">
            {categories.map((c) => (
              <li key={c.slug}>
                <Link href={catalogUrl({ categoria: c.slug })} onClick={close} className="group/tile block">
                  <span className="relative block aspect-3/4 overflow-hidden rounded-lg bg-raised">
                    {opened && c.image ? (
                      <Image src={c.image} alt="" fill sizes="128px" className="object-cover transition duration-500 group-hover/tile:scale-105" />
                    ) : null}
                  </span>
                  <span className="mt-2 block text-center [overflow-wrap:anywhere]">{c.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </li>
  );
}
