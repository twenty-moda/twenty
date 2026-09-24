import { ArrowRight, Eye, Target } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { JsonLd } from "@/components/store/json-ld";
import { PageHeader } from "@/components/store/page-header";
import { StoreCard } from "@/components/store/store-card";
import { RichInline, RichText } from "@/components/ui/rich-text";
import { excerpt } from "@/lib/rich-text";
import { siteUrl } from "@/lib/links";
import { getSiteSettings } from "../_data";

export async function generateMetadata(): Promise<Metadata> {
  const { about } = await getSiteSettings();
  return {
    title: "Nosotros",
    description: excerpt(about.body, 160) || "La historia de TWENTY, moda urbana nacida en Gamarra.",
    alternates: { canonical: "/nosotros" },
  };
}

export default async function AboutPage() {
  const { about, store, contact, company } = await getSiteSettings();

  return (
    <>
      <PageHeader eyebrow="Nosotros" title={about.title} />

      {about.image ? (
        <div className="mx-auto max-w-5xl px-4">
          <div className="relative aspect-4/3 overflow-hidden rounded-3xl bg-raised md:aspect-video">
            <Image src={about.image} alt="" fill priority sizes="(min-width: 1024px) 1024px, 100vw" className="object-cover" />
          </div>
        </div>
      ) : null}

      <article className="mx-auto max-w-2xl px-4 py-10">
        <RichText source={about.body} />
        {about.quote ? (
          <blockquote className="reveal mt-10 border-l-4 border-white pl-5 text-2xl leading-tight font-extrabold text-balance uppercase md:text-3xl [&_strong]:font-black [&_strong]:underline [&_strong]:decoration-4 [&_strong]:underline-offset-4">
            <RichInline source={about.quote} />
          </blockquote>
        ) : null}
      </article>

      {about.mission || about.vision ? (
        <section aria-label="Misión y visión" className="mx-auto grid grid-cols-1 max-w-5xl gap-4 px-4 md:grid-cols-2">
          {[
            { icon: Target, title: "Misión", text: about.mission },
            { icon: Eye, title: "Visión", text: about.vision },
          ]
            .filter((b) => b.text)
            .map(({ icon: Icon, title, text }) => (
              <div key={title} className="reveal rounded-2xl border border-line bg-surface p-6">
                <span className="grid size-11 place-items-center rounded-full bg-raised">
                  <Icon className="size-5" aria-hidden />
                </span>
                <h2 className="mt-4 text-sm font-bold tracking-widest uppercase">{title}</h2>
                <p className="mt-2 leading-relaxed text-white/80">{text}</p>
              </div>
            ))}
        </section>
      ) : null}

      {about.strengths.length ? (
        <section aria-labelledby="fortalezas" className="mx-auto max-w-5xl px-4 pt-14">
          <h2 id="fortalezas" className="reveal text-2xl font-extrabold tracking-tight uppercase md:text-3xl">
            {about.strengthsTitle || "Lo que nos hace diferentes"}
          </h2>
          <ul className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {about.strengths.map((s) => (
              <li key={s.title} className="reveal rounded-2xl border border-line bg-surface p-6">
                {s.icon ? (
                  <span className="grid size-11 place-items-center rounded-full bg-raised">
                    <Image src={s.icon} alt="" width={24} height={24} className="size-6 object-contain" />
                  </span>
                ) : null}
                <h3 className="mt-4 font-bold uppercase">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{s.description}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="mx-auto max-w-5xl px-4 pt-10 text-center">
        <Link href="/catalogo" className="inline-flex h-13 items-center gap-2 rounded-full bg-white px-8 text-sm font-bold tracking-wide text-black uppercase">
          Ver el catálogo <ArrowRight className="size-4" aria-hidden />
        </Link>
      </div>

      {store ? (
        <div className="pt-6">
          <StoreCard store={store} contact={contact} />
        </div>
      ) : null}

      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "AboutPage",
          url: `${siteUrl()}/nosotros`,
          name: about.title,
          about: {
            "@type": "Organization",
            name: "TWENTY",
            legalName: company.legalName || undefined,
            taxID: company.ruc || undefined,
            url: siteUrl(),
            logo: `${siteUrl()}/brand/twenty-logo.webp`,
          },
        }}
      />
    </>
  );
}
