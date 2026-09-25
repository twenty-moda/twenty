import Image from "next/image";
import type { SiteSettings } from "@/server/services/content";
import { SectionHeading } from "./section-heading";

/** "@usuario" de Instagram (o de la primera red) a partir de su enlace. */
function handleFrom(socials: SiteSettings["socials"]) {
  const social = socials.find((s) => /instagram/i.test(s.url)) ?? socials[0];
  try {
    const first = new URL(social.url).pathname.split("/").filter(Boolean)[0];
    return first ? `@${first.replace(/^@/, "")}` : null;
  } catch {
    return null;
  }
}

/** Comunidad: el usuario de la marca en grande, fotos y los botones a sus redes. */
export function Community({ socials, photos }: { socials: SiteSettings["socials"]; photos: string[] }) {
  const handle = socials.length ? handleFrom(socials) : null;
  if (!handle) return null;
  return (
    <section aria-labelledby="comunidad" className="reveal mx-auto max-w-7xl py-8 lg:py-12 2xl:max-w-[96rem]">
      <SectionHeading id="comunidad" eyebrow="Etiquétanos en tus fits" title={handle} />
      {photos.length ? (
        <ul className="mt-5 grid grid-cols-3 gap-2 px-4 lg:grid-cols-4 lg:gap-3 lg:px-6">
          {photos.map((src, i) => (
            <li key={src} className={i === 3 ? "hidden lg:block" : undefined}>
              <div className="relative aspect-3/4 overflow-hidden rounded-xl bg-raised lg:rounded-2xl">
                <Image src={src} alt="" fill sizes="(min-width: 1024px) 25vw, 33vw" className="object-cover" />
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="mt-4 flex gap-2.5 px-4 lg:px-6">
        {socials.map((s) => (
          <a
            key={s.url}
            href={s.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-12 grow items-center justify-center rounded-full border-[1.5px] border-white px-6 text-[13px] font-extrabold tracking-[0.06em] uppercase transition-colors hover:bg-white hover:text-black lg:grow-0"
          >
            {s.name}
          </a>
        ))}
      </div>
    </section>
  );
}
