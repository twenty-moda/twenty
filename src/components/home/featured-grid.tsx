"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, ViewTransition } from "react";
import { cn } from "@/lib/cn";
import { discountPercent, formatPrice } from "@/lib/money";
import { productMorphName } from "../store/product-card";
import type { FeaturedItem } from "./featured-data";
import { SectionHeading } from "./section-heading";

const PER_FILTER = 8;
const MAX_CHIPS = 5;

/**
 * "Lo más buscado": destacados primero y filtros por categoría. Filtra en el navegador (la página sigue
 * estática). Los stickers amarillos son ofertas: descuento o promo "N x S/".
 */
export function FeaturedGrid({ items }: { items: FeaturedItem[] }) {
  const [filter, setFilter] = useState<string | null>(null);
  if (items.length === 0) return null;

  const counts = new Map<string, { name: string; count: number }>();
  for (const item of items) {
    const current = counts.get(item.category.slug) ?? { name: item.category.name, count: 0 };
    counts.set(item.category.slug, { ...current, count: current.count + 1 });
  }
  const chips = [...counts.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, MAX_CHIPS);
  const shown = items.filter((i) => !filter || i.category.slug === filter).slice(0, PER_FILTER);

  return (
    <section aria-labelledby="lo-mas-buscado" className="mx-auto max-w-7xl py-8 lg:py-12 2xl:max-w-[96rem]">
      <SectionHeading id="lo-mas-buscado" eyebrow="Nuevos y favoritos" title="Lo más buscado" />
      {chips.length > 1 ? (
        <div role="group" aria-label="Filtrar por categoría" className="no-scrollbar mt-5 flex gap-2 overflow-x-auto px-4 lg:px-6">
          {[["", { name: "Todo", count: items.length }] as const, ...chips].map(([slug, { name }]) => {
            const active = (filter ?? "") === slug;
            return (
              <button
                key={slug || "todo"}
                type="button"
                aria-pressed={active}
                onClick={() => setFilter(slug || null)}
                className={cn(
                  "min-h-10 shrink-0 rounded-full border-[1.5px] px-4 text-[13px] font-bold transition-colors",
                  active ? "border-white bg-white text-black" : "border-white/25 text-white hover:border-white/60",
                )}
              >
                {name}
              </button>
            );
          })}
        </div>
      ) : null}
      <ul className="mt-5 grid grid-cols-2 gap-x-3 gap-y-6 px-4 md:grid-cols-3 lg:grid-cols-4 lg:gap-x-5 lg:gap-y-9 lg:px-6">
        {shown.map((item, i) => (
          <li key={item.id} className="min-w-0 animate-fade-up" style={{ animationDelay: `${i * 40}ms` }}>
            <FeaturedCard item={item} eager={i < 2} />
          </li>
        ))}
      </ul>
      <div className="mt-8 flex justify-center px-4">
        <Link
          href="/catalogo"
          className="inline-flex h-13 w-full items-center justify-center rounded-full border-[1.5px] border-white px-10 text-sm font-extrabold tracking-[0.06em] uppercase transition-colors hover:bg-white hover:text-black md:w-auto"
        >
          Ver el catálogo completo
        </Link>
      </div>
    </section>
  );
}

function FeaturedCard({ item, eager }: { item: FeaturedItem; eager: boolean }) {
  const percent = item.isOutfit ? null : discountPercent(item.priceCents, item.compareAtPriceCents);
  const sticker = percent ? `-${percent}%` : item.promo;
  const sizes = "(min-width: 1024px) 25vw, (min-width: 768px) 33vw, 50vw";
  return (
    <article className="group">
      {/* prefetch: la ficha es estática (sale del CDN), se abre al instante y la foto "vuela". */}
      <Link href={`/product/${item.slug}`} prefetch className="block transition-transform duration-200 active:scale-[0.98]">
        <ViewTransition name={productMorphName(item.slug)} share="morph" default="none">
          <div className="relative aspect-3/4 overflow-hidden rounded-2xl bg-raised">
            {item.image ? (
              <Image
                src={item.image.path}
                alt={item.image.alt}
                fill
                sizes={sizes}
                loading={eager ? "eager" : "lazy"}
                className={cn("object-cover transition duration-700 ease-out md:group-hover:scale-[1.05]", item.hoverImage && "md:group-hover:opacity-0")}
              />
            ) : null}
            {item.hoverImage ? (
              <Image
                src={item.hoverImage.path}
                alt=""
                fill
                sizes={sizes}
                className="hidden object-cover opacity-0 transition duration-700 ease-out md:block md:group-hover:scale-[1.05] md:group-hover:opacity-100"
              />
            ) : null}
            {sticker ? (
              <span className="absolute top-2.5 left-2 animate-wobble rounded-md bg-offer px-2 py-1 font-display text-lg leading-none font-black text-black uppercase shadow-lg shadow-black/30">
                {sticker}
              </span>
            ) : null}
          </div>
        </ViewTransition>
        <div className="mt-3 space-y-1">
          <h3 className="line-clamp-2 text-sm leading-snug font-semibold lg:text-base">{item.name}</h3>
          <p className="truncate font-mono text-[10.5px] tracking-[0.04em] text-subtle uppercase lg:text-[11px]">{item.detail}</p>
          <p className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-base font-extrabold lg:text-lg">
              {item.hasPriceRange ? "Desde " : ""}
              {formatPrice(item.priceCents)}
            </span>
            {item.compareAtPriceCents && item.compareAtPriceCents > item.priceCents ? (
              <s className="text-sm text-subtle">
                {item.isOutfit ? "Por separado " : ""}
                {formatPrice(item.compareAtPriceCents)}
              </s>
            ) : null}
            {percent && item.promo ? <span className="text-[11px] font-bold text-offer">{item.promo}</span> : null}
          </p>
        </div>
      </Link>
    </article>
  );
}
