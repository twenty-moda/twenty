import { Clock, MapPin, MessageCircle } from "lucide-react";
import { mapsUrl, whatsappUrl } from "@/lib/links";
import type { SiteSettings } from "@/server/services/content";

export function StoreCard({ store, contact }: { store: NonNullable<SiteSettings["store"]>; contact: SiteSettings["contact"] }) {
  return (
    <section aria-labelledby="tienda" className="reveal mx-auto max-w-7xl 2xl:max-w-[96rem] px-4 py-6 lg:px-6">
      <div className="rounded-2xl bg-raised p-6 md:flex md:items-center md:justify-between md:gap-10 md:p-10">
        <div>
          <h2 id="tienda" className="text-sm font-bold tracking-widest uppercase">
            Visítanos en Gamarra
          </h2>
          <p className="mt-3 flex gap-2 text-muted">
            <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden /> {store.address}
          </p>
          {contact.openingHours ? (
            <p className="mt-2 flex gap-2 text-muted">
              <Clock className="mt-0.5 size-4 shrink-0" aria-hidden /> {contact.openingHours}
            </p>
          ) : null}
        </div>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row md:mt-0 md:shrink-0">
          <a
            href={mapsUrl(store.latitude, store.longitude)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-12 items-center justify-center rounded-full bg-white px-6 text-sm font-semibold text-black"
          >
            Cómo llegar
          </a>
          {contact.whatsapp ? (
            <a
              href={whatsappUrl(contact.whatsapp, contact.whatsappMessage)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-line px-6 text-sm font-semibold"
            >
              <MessageCircle className="size-4" aria-hidden /> WhatsApp
            </a>
          ) : null}
        </div>
      </div>
    </section>
  );
}
