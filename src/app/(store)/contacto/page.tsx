import { BookOpenText, Clock, Mail, MapPin, MessageCircle, Navigation, PackageSearch, Phone } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ContactForm } from "@/components/forms/contact-form";
import { FaqList } from "@/components/store/faq-list";
import { JsonLd } from "@/components/store/json-ld";
import { PageHeader } from "@/components/store/page-header";
import { richTextToPlain } from "@/lib/rich-text";
import { mapEmbedUrl, mapsDirectionsUrl, wazeUrl, whatsappUrl } from "@/lib/links";
import { getSiteSettings } from "../_data";

export const metadata: Metadata = {
  title: "Contacto",
  description: "Escríbenos por WhatsApp, llámanos o visítanos en Gamarra. Respondemos tus dudas sobre tallas, envíos y pedidos.",
  alternates: { canonical: "/contacto" },
};

const telHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, "")}`;

export default async function ContactPage() {
  const { contact, store, faqs } = await getSiteSettings();

  return (
    <>
      <PageHeader eyebrow="Contacto" title="Hablemos" description="Por WhatsApp te respondemos más rápido. También puedes llamarnos, escribirnos o visitarnos." />

      <div className="mx-auto max-w-5xl space-y-10 px-4">
        <section aria-label="Canales de atención" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {contact.whatsapp ? (
            <a
              href={whatsappUrl(contact.whatsapp, contact.whatsappMessage)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-4 rounded-2xl bg-white p-5 text-black transition active:scale-[0.98] sm:flex-col sm:items-start"
            >
              <MessageCircle className="size-7 shrink-0" aria-hidden />
              <span>
                <span className="block font-bold">WhatsApp</span>
                <span className="block text-sm text-black/70">Respuesta rápida</span>
              </span>
            </a>
          ) : null}
          {contact.phone ? (
            <a href={telHref(contact.phone)} className="flex items-center gap-4 rounded-2xl border border-line p-5 transition hover:border-white/40 active:scale-[0.98] sm:flex-col sm:items-start">
              <Phone className="size-7 shrink-0" aria-hidden />
              <span>
                <span className="block font-bold">Llámanos</span>
                <span className="block text-sm text-muted">{contact.phone}</span>
              </span>
            </a>
          ) : null}
          {contact.email ? (
            <a href={`mailto:${contact.email}`} className="flex min-w-0 items-center gap-4 rounded-2xl border border-line p-5 transition hover:border-white/40 active:scale-[0.98] sm:flex-col sm:items-start">
              <Mail className="size-7 shrink-0" aria-hidden />
              <span className="min-w-0">
                <span className="block font-bold">Email</span>
                <span className="block truncate text-sm text-muted">{contact.email}</span>
              </span>
            </a>
          ) : null}
        </section>

        <div className="grid grid-cols-1 gap-10 lg:grid-cols-2">
          <section aria-labelledby="escribenos" className="reveal rounded-2xl border border-line bg-surface p-5 md:p-8">
            <h2 id="escribenos" className="text-xl font-extrabold tracking-tight uppercase">
              Déjanos un mensaje
            </h2>
            <p className="mt-1 mb-6 text-sm text-muted">Te respondemos por email o WhatsApp.</p>
            <ContactForm />
          </section>

          {store ? (
            <section aria-labelledby="tienda" className="reveal overflow-hidden rounded-2xl border border-line">
              <iframe
                title="Mapa de la tienda TWENTY en Gamarra"
                src={mapEmbedUrl(store.latitude, store.longitude)}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                className="aspect-4/3 w-full border-0 bg-raised lg:aspect-auto lg:h-80"
              />
              <div className="space-y-3 p-5 md:p-8">
                <h2 id="tienda" className="text-xl font-extrabold tracking-tight uppercase">
                  Tienda en Gamarra
                </h2>
                <p className="flex gap-2 text-muted">
                  <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden /> {store.address}
                </p>
                {contact.openingHours ? (
                  <p className="flex gap-2 text-muted">
                    <Clock className="mt-0.5 size-4 shrink-0" aria-hidden /> {contact.openingHours}
                  </p>
                ) : null}
                <div className="flex flex-wrap gap-2.5 pt-1">
                  <a
                    href={mapsDirectionsUrl(store.latitude, store.longitude)}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Cómo llegar con Google Maps"
                    className="inline-flex h-12 grow items-center justify-center gap-2 rounded-full border border-line px-6 text-sm font-semibold sm:grow-0"
                  >
                    <MapPin className="size-4" aria-hidden /> Google Maps
                  </a>
                  <a
                    href={wazeUrl(store.latitude, store.longitude)}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Cómo llegar con Waze"
                    className="inline-flex h-12 grow items-center justify-center gap-2 rounded-full border border-line px-6 text-sm font-semibold sm:grow-0"
                  >
                    <Navigation className="size-4" aria-hidden /> Waze
                  </a>
                </div>
              </div>
            </section>
          ) : null}
        </div>

        <section aria-label="Otras ayudas" className="reveal grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Link href="/tracking" className="flex items-center gap-4 rounded-2xl border border-line p-5 transition hover:border-white/40 active:scale-[0.98]">
            <PackageSearch className="size-6 shrink-0" aria-hidden />
            <span>
              <span className="block font-bold">Rastrea tu pedido</span>
              <span className="block text-sm text-muted">Con tu número de pedido y tu celular</span>
            </span>
          </Link>
          <Link href="/libro-de-reclamaciones" className="flex items-center gap-4 rounded-2xl border border-line p-5 transition hover:border-white/40 active:scale-[0.98]">
            <BookOpenText className="size-6 shrink-0" aria-hidden />
            <span>
              <span className="block font-bold">Libro de Reclamaciones</span>
              <span className="block text-sm text-muted">Registra un reclamo o una queja</span>
            </span>
          </Link>
        </section>

        {faqs.length ? (
          <section aria-labelledby="faq" className="reveal mx-auto max-w-3xl">
            <p className="text-center text-[11px] font-bold tracking-widest text-muted uppercase">¿Tienes dudas?</p>
            <h2 id="faq" className="mt-2 mb-6 text-center text-2xl font-extrabold tracking-tight uppercase md:text-3xl">
              Preguntas frecuentes
            </h2>
            <FaqList faqs={faqs} />
          </section>
        ) : null}
      </div>

      {faqs.length ? (
        <JsonLd
          data={{
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: faqs.map((f) => ({ "@type": "Question", name: f.question, acceptedAnswer: { "@type": "Answer", text: richTextToPlain(f.answer) } })),
          }}
        />
      ) : null}
    </>
  );
}
