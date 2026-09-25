import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** "En Polo Boxi Fit 99, Polo Regular Fit, Polo Slim Fit y 6 más". */
export function promoProductNames(products: { name: string }[]) {
  const names = products.map((p) => p.name);
  return `En ${names.slice(0, 3).join(", ")}${names.length > 3 ? ` y ${names.length - 3} más` : ""}`;
}

type PromoCardProps = { href: string; eyebrow: string; title: string; detail: string; cta: ReactNode; titleClassName?: string };

/** Tarjeta blanca de promo ("Lleva 2 x S/ 100"). En el home lleva al catálogo; en /promos, a su sección. */
export function PromoCard({ href, eyebrow, title, detail, cta, titleClassName }: PromoCardProps) {
  return (
    <Link
      href={href}
      className="flex h-full flex-col justify-between rounded-xl bg-white p-5 text-black transition hover:-translate-y-0.5 hover:bg-sections active:scale-[0.98]"
    >
      <div>
        <p className="text-xs font-semibold tracking-widest uppercase">{eyebrow}</p>
        <p className={cn("mt-1 text-4xl leading-none font-extrabold tracking-tight", titleClassName)}>{title}</p>
        <p className="mt-3 line-clamp-2 text-sm text-black/70">{detail}</p>
      </div>
      <span className="mt-5 inline-flex items-center gap-1 text-sm font-semibold">{cta}</span>
    </Link>
  );
}
