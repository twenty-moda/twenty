import { MapPin, MessageCircle } from "lucide-react";
import { mapsUrl, whatsappUrl } from "@/lib/links";
import type { SiteSettings } from "@/server/services/content";

/** La tienda de Gamarra con un mapa de calles dibujado (sin mapas de terceros: no pesa ni pide permisos). */
export function StoreMapCard({ store, contact }: { store: NonNullable<SiteSettings["store"]>; contact: SiteSettings["contact"] }) {
  return (
    <section aria-labelledby="tienda" className="reveal px-4 py-8 lg:px-6 lg:py-0">
      <div className="flex h-full flex-col overflow-hidden rounded-3xl border border-line bg-surface">
        <div aria-hidden className="street-grid relative h-44 shrink-0 lg:h-auto lg:min-h-56 lg:grow">
          <div className="absolute inset-x-0 top-24 h-3.5 -rotate-12 bg-[#34353a]" />
          <span className="absolute top-16 left-[44%] size-6 -rotate-45 animate-ping-ring rounded-[50%_50%_50%_0] border-[3px] border-black bg-white text-white" />
          <span className="absolute top-14 left-[calc(44%+2.25rem)] rounded-lg bg-black px-2.5 py-1 font-mono text-[11px] font-semibold">TWENTY · Gamarra</span>
        </div>
        <div className="flex flex-col gap-3 p-5 lg:p-7">
          <h2 id="tienda" className="font-display text-[2.5rem] leading-[0.9] font-black uppercase lg:text-5xl">
            Tienda en Gamarra
          </h2>
          <div className="space-y-1 text-sm leading-relaxed text-white/80 lg:text-[15px]">
            <p>{store.address}</p>
            {contact.openingHours ? <p>{contact.openingHours}</p> : null}
            <p className="font-semibold text-white">Recojo gratis al comprar en la web.</p>
          </div>
          <div className="mt-1 flex flex-wrap gap-2.5">
            <a
              href={mapsUrl(store.latitude, store.longitude)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-12 grow items-center justify-center gap-2 rounded-full bg-white px-6 text-[13px] font-extrabold tracking-[0.06em] text-black uppercase sm:grow-0"
            >
              <MapPin className="size-4" aria-hidden /> Cómo llegar
            </a>
            {contact.whatsapp ? (
              <a
                href={whatsappUrl(contact.whatsapp, contact.whatsappMessage)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-12 grow items-center justify-center gap-2 rounded-full border-[1.5px] border-white/30 px-6 text-[13px] font-bold tracking-[0.04em] uppercase sm:grow-0"
              >
                <MessageCircle className="size-4" aria-hidden /> WhatsApp
              </a>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
