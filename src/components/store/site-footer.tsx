import Image from "next/image";
import Link from "next/link";
import { LEGAL_PAGES } from "@/lib/legal-pages";
import { catalogUrl, mapsUrl, whatsappUrl } from "@/lib/links";
import type { CategoryLink } from "@/server/services/catalog";
import type { SiteSettings } from "@/server/services/content";
import { SubscribeForm } from "../forms/subscribe-form";
import { Logo } from "./logo";

const payments = [
  { src: "/payments/visa.png", alt: "Visa", width: 98, height: 64 },
  { src: "/payments/mastercard.png", alt: "Mastercard", width: 98, height: 64 },
  { src: "/payments/americanexpress.png", alt: "American Express", width: 46, height: 30 },
  { src: "/payments/yape.png", alt: "Yape", width: 64, height: 64 },
  { src: "/payments/plin.png", alt: "Plin", width: 64, height: 64 },
];

const heading = "text-xs font-semibold tracking-widest text-muted uppercase";

// En pantallas táctiles (teléfonos y tablets) cada enlace mide 40 px de alto; con mouse, más compacto.
const linkClass = "inline-flex min-h-10 items-center py-1 leading-snug hover:text-muted pointer-fine:min-h-8";

function LinkList({ title, links }: { title: string; links: { href: string; label: string; external?: boolean }[] }) {
  return (
    <nav aria-label={title} className="min-w-0">
      <h2 className={heading}>{title}</h2>
      <ul className="mt-3 text-sm">
        {links.map((l) => (
          <li key={l.href}>
            {l.external ? (
              <a href={l.href} target="_blank" rel="noopener noreferrer" className={linkClass}>
                {l.label}
              </a>
            ) : (
              <Link href={l.href} className={linkClass}>
                {l.label}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
}

type SiteFooterProps = { categories: CategoryLink[]; showPromos: boolean; settings: SiteSettings; year: number };

export function SiteFooter({ categories, showPromos, settings, year }: SiteFooterProps) {
  const { contact, socials, store, seo, company } = settings;
  return (
    <footer className="mt-16 border-t border-line bg-surface print:hidden">
      <div className="mx-auto max-w-7xl 2xl:max-w-[96rem] px-4 py-12 lg:px-6">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1.2fr_2fr]">
          <div className="space-y-5">
            <Logo className="w-32" />
            {seo.description ? <p className="max-w-sm text-sm leading-relaxed text-muted">{seo.description}</p> : null}
            <div className="max-w-sm">
              <h2 className={heading}>Únete a la comunidad</h2>
              <p className="mt-2 mb-3 text-sm text-muted">Entérate primero de los drops y las promos.</p>
              <SubscribeForm />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:gap-x-6 md:grid-cols-4">
            <LinkList
              title="Tienda"
              links={[
                { href: "/catalogo", label: "Ver todo" },
                ...(showPromos ? [{ href: "/promos", label: "Promos" }] : []),
                ...categories.slice(0, showPromos ? 4 : 5).map((c) => ({ href: catalogUrl({ categoria: c.slug }), label: c.name })),
              ]}
            />
            <LinkList
              title="Ayuda"
              links={[
                { href: "/tracking", label: "Rastrea tu pedido" },
                { href: "/contacto", label: "Contacto" },
                { href: "/contacto#faq", label: "Preguntas frecuentes" },
                ...(contact.whatsapp ? [{ href: whatsappUrl(contact.whatsapp, contact.whatsappMessage), label: "WhatsApp", external: true }] : []),
              ]}
            />
            <LinkList
              title="TWENTY"
              links={[
                { href: "/nosotros", label: "Nosotros" },
                { href: "/blogs", label: "Blog" },
                ...socials.map((s) => ({ href: s.url, label: s.name, external: true })),
              ]}
            />
            <LinkList title="Legal" links={LEGAL_PAGES.map((p) => ({ href: p.href, label: p.title }))} />
          </div>
        </div>

        {/* Fila propia: el aviso del Libro de Reclamaciones siempre visible y sin apretarse en una columna. */}
        <div className="mt-10 flex flex-col gap-6 border-t border-line pt-8 md:flex-row md:items-center md:justify-between">
          {store ? (
            <address className="flex min-w-0 flex-col gap-1 text-sm text-muted not-italic lg:flex-row lg:items-center lg:gap-6">
              <span>
                <span className="font-semibold text-white">Tienda:</span> {store.address}
              </span>
              {contact.openingHours ? <span>{contact.openingHours}</span> : null}
              <a
                href={mapsUrl(store.latitude, store.longitude)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-10 items-center self-start text-white underline underline-offset-4 pointer-fine:min-h-0"
              >
                Cómo llegar
              </a>
            </address>
          ) : null}
          <Link
            href="/libro-de-reclamaciones"
            className="inline-flex shrink-0 items-center gap-3 self-start rounded-xl border border-line py-2 pr-4 pl-3 hover:border-white/40 md:self-auto"
          >
            <Image src="/libro-reclamaciones.png" alt="" width={320} height={330} className="h-10 w-auto" />
            <span className="text-xs leading-tight font-semibold uppercase">
              Libro de
              <br />
              Reclamaciones
            </span>
          </Link>
        </div>
      </div>

      <div className="border-t border-line">
        <div className="mx-auto flex max-w-7xl 2xl:max-w-[96rem] flex-col gap-4 px-4 py-6 md:flex-row md:items-center md:justify-between lg:px-6">
          <ul className="flex flex-wrap items-center gap-2" aria-label="Medios de pago">
            {payments.map((p) => (
              <li key={p.alt} className="grid h-8 w-12 place-items-center rounded bg-white px-1.5">
                <Image src={p.src} alt={p.alt} width={p.width} height={p.height} className="max-h-6 w-auto object-contain" />
              </li>
            ))}
          </ul>
          <p className="text-xs text-subtle">
            © {year} TWENTY{company.legalName ? ` · ${company.legalName}` : ""}
            {company.ruc ? ` · RUC ${company.ruc}` : ""}
          </p>
        </div>
      </div>
    </footer>
  );
}
