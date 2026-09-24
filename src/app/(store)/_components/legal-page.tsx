import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/store/page-header";
import { RichText } from "@/components/ui/rich-text";
import { cn } from "@/lib/cn";
import { LEGAL_PAGES, legalPage } from "@/lib/legal-pages";
import type { LegalKey } from "@/server/services/content";
import { getSiteSettings } from "../_data";

const dayFormat = new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", day: "numeric", month: "long", year: "numeric" });

export function legalMetadata(key: LegalKey): Metadata {
  const page = legalPage(key);
  return { title: page.title, description: page.description, alternates: { canonical: page.href } };
}

/** Términos, privacidad, envíos y cambios: el texto se edita en Admin → Contenido → Páginas legales. */
export async function LegalPage({ page: key }: { page: LegalKey }) {
  const { legal, company } = await getSiteSettings();
  const page = legalPage(key);
  const { body, updatedAt } = legal[key];

  return (
    <>
      <PageHeader eyebrow="Legal" title={page.title} description={updatedAt ? `Última actualización: ${dayFormat.format(new Date(updatedAt))}` : undefined} />
      <div className="mx-auto max-w-5xl px-4 lg:grid lg:grid-cols-[1fr_16rem] lg:gap-12">
        <article className="min-w-0">
          {body ? <RichText source={body} /> : <p className="text-muted">Estamos actualizando esta página. Si tienes dudas, escríbenos por WhatsApp.</p>}
          {company.legalName ? (
            <p className="mt-10 border-t border-line pt-6 text-sm text-muted">
              {company.legalName}
              {company.ruc ? ` · RUC ${company.ruc}` : ""}
              {company.address ? ` · ${company.address}` : ""}
            </p>
          ) : null}
        </article>
        <nav aria-label="Páginas legales" className="mt-10 lg:mt-0">
          <ul className="space-y-1 rounded-2xl border border-line p-2 lg:sticky lg:top-20">
            {LEGAL_PAGES.map((p) => (
              <li key={p.key}>
                <Link
                  href={p.href}
                  aria-current={p.key === key ? "page" : undefined}
                  className={cn("flex h-11 items-center rounded-xl px-3 text-sm", p.key === key ? "bg-white font-semibold text-black" : "text-muted hover:text-white")}
                >
                  {p.title}
                </Link>
              </li>
            ))}
            <li>
              <Link href="/libro-de-reclamaciones" className="flex h-11 items-center rounded-xl px-3 text-sm text-muted hover:text-white">
                Libro de Reclamaciones
              </Link>
            </li>
          </ul>
        </nav>
      </div>
    </>
  );
}
