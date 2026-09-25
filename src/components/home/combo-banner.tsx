import { ArrowRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { PromoGroup } from "@/lib/promos";
import { promotionLabel } from "../store/price";
import { promoProductNames } from "../store/promo-strip";

/**
 * La primera promo "N x S/" en grande (amarillo = oferta), con la foto de una de sus prendas. Solo en el teléfono:
 * desde tablet la promo va como sticker sobre la foto del hero.
 */
export function ComboBanner({ combo }: { combo: PromoGroup }) {
  const photo = combo.products.find((p) => p.image)?.image;
  return (
    <section aria-labelledby="combo" className="reveal px-4 py-4 md:hidden">
      <div className="relative h-[28rem] overflow-hidden rounded-3xl bg-offer text-black">
        {photo ? (
          // Abajo a la derecha, al lado del botón: el texto de arriba nunca queda sobre la foto.
          <div className="absolute right-0 bottom-0 h-44 w-[52%] overflow-hidden rounded-tl-3xl">
            <Image src={photo.path} alt="" fill sizes="52vw" className="object-cover" />
          </div>
        ) : null}
        <div className="relative flex flex-col gap-2.5 p-6">
          <p className="font-mono text-[11px] font-semibold tracking-[0.14em] uppercase">Combo</p>
          <h2 id="combo" className="font-display text-[5.25rem] leading-[0.82] font-black whitespace-pre-line uppercase">
            {promotionLabel(combo.promotion).replace(" x ", " x\n")}
          </h2>
          <p className="max-w-[18rem] text-sm leading-snug font-medium">{promoProductNames(combo.products)}. El descuento se aplica solo en el carrito.</p>
        </div>
        <Link
          href="/promos"
          className="absolute bottom-6 left-6 inline-flex h-12 items-center gap-2 rounded-full bg-black px-5 text-[13px] font-extrabold tracking-[0.06em] text-white uppercase"
        >
          Ver promos <ArrowRight className="size-4" aria-hidden />
        </Link>
      </div>
    </section>
  );
}
