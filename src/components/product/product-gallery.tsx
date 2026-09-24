"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { cn } from "@/lib/cn";
import type { ImageRef } from "@/server/services/catalog";

/**
 * Móvil: carrusel a pantalla completa que se desliza con el dedo (scroll-snap, sin librerías).
 * Escritorio: todas las fotos en grilla de 2 columnas.
 */
export function ProductGallery({ images, eager = false }: { images: ImageRef[]; eager?: boolean }) {
  const trackRef = useRef<HTMLUListElement>(null);
  const [index, setIndex] = useState(0);

  const goTo = (i: number) => {
    const track = trackRef.current;
    if (track) track.scrollTo({ left: i * track.clientWidth, behavior: "smooth" });
  };

  if (images.length === 0) return <div className="aspect-3/4 bg-raised md:rounded-lg" />;

  return (
    <div className="relative min-w-0">
      <ul
        ref={trackRef}
        aria-label="Fotos del producto"
        onScroll={(e) => {
          const el = e.currentTarget;
          setIndex(Math.round(el.scrollLeft / el.clientWidth));
        }}
        className={cn(
          // Móvil y tablet: carrusel (en tablet con esquinas redondeadas). Escritorio: grilla.
          "no-scrollbar flex snap-x snap-mandatory overflow-x-auto md:rounded-lg lg:grid lg:gap-2 lg:overflow-visible lg:rounded-none",
          images.length > 1 ? "lg:grid-cols-2" : "lg:mx-auto lg:max-w-xl lg:grid-cols-1",
        )}
      >
        {images.map((img, i) => (
          <li key={img.path} className="relative aspect-3/4 w-full shrink-0 snap-center bg-raised lg:overflow-hidden lg:rounded-lg">
            <Image
              src={img.path}
              alt={`${img.alt}${images.length > 1 ? ` (foto ${i + 1} de ${images.length})` : ""}`}
              fill
              sizes="(min-width: 1024px) 30vw, (min-width: 768px) 50vw, 100vw"
              loading={eager && i === 0 ? "eager" : "lazy"}
              fetchPriority={eager && i === 0 ? "high" : undefined}
              className="object-cover"
            />
          </li>
        ))}
      </ul>

      {images.length > 1 ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 flex items-center justify-center gap-1.5 lg:hidden">
          {images.map((img, i) => (
            <button
              key={img.path}
              type="button"
              onClick={() => goTo(i)}
              aria-label={`Ver foto ${i + 1}`}
              aria-current={i === index}
              className={cn("pointer-events-auto h-1.5 rounded-full bg-white transition-all", i === index ? "w-5" : "w-1.5 opacity-50")}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
