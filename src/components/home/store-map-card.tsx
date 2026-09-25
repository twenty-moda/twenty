import { MapPin, MessageCircle, Navigation } from "lucide-react";
import { mapEmbedUrl, mapsDirectionsUrl, wazeUrl, whatsappUrl } from "@/lib/links";
import type { SiteSettings } from "@/server/services/content";

/**
 * La tienda de Gamarra con el mapa real de Google (a color, sin API key) y la ruta en Google Maps o Waze.
 * El mapa se carga solo al acercarse (loading="lazy"): la portada sigue estática y liviana. Mientras carga
 * se ve la cuadrícula de calles.
 */
export function StoreMapCard({ store, contact }: { store: NonNullable<SiteSettings["store"]>; contact: SiteSettings["contact"] }) {
  const { latitude, longitude } = store;
  return (
    <section aria-labelledby="tienda" className="reveal px-4 py-8 lg:px-6 lg:py-0">
      <div className="flex h-full flex-col overflow-hidden rounded-3xl border border-line bg-surface">
        <div className="street-grid relative h-60 shrink-0 md:h-72 lg:h-auto lg:min-h-64 lg:grow">
          <iframe
            title="Mapa de la tienda TWENTY en Gamarra"
            src={mapEmbedUrl(latitude, longitude)}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            className="absolute inset-0 size-full border-0"
          />
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
          <p className="mt-1 font-mono text-[11px] font-semibold tracking-[0.12em] text-white/60 uppercase">Cómo llegar</p>
          <div className="flex flex-wrap gap-2.5">
            <a
              href={mapsDirectionsUrl(latitude, longitude)}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Cómo llegar con Google Maps"
              className="inline-flex h-12 grow items-center justify-center gap-2 rounded-full bg-white px-5 text-[13px] font-extrabold tracking-[0.06em] text-black uppercase"
            >
              <MapPin className="size-4" aria-hidden /> Google Maps
            </a>
            <a
              href={wazeUrl(latitude, longitude)}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Cómo llegar con Waze"
              className="inline-flex h-12 grow items-center justify-center gap-2 rounded-full bg-white px-5 text-[13px] font-extrabold tracking-[0.06em] text-black uppercase"
            >
              <Navigation className="size-4" aria-hidden /> Waze
            </a>
            {contact.whatsapp ? (
              <a
                href={whatsappUrl(contact.whatsapp, contact.whatsappMessage)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-12 grow items-center justify-center gap-2 rounded-full border-[1.5px] border-white/30 px-5 text-[13px] font-bold tracking-[0.04em] uppercase"
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
