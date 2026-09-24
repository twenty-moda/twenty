"use client";

import { BookOpen, ChevronRight, Clock, Info, Mail, MapPin, Menu, MessageCircle, PackageSearch, Search, ShoppingBag, UserRound } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { cartTotals } from "@/lib/cart";
import { catalogUrl, mapsUrl, whatsappUrl } from "@/lib/links";
import type { CategoryLink } from "@/server/services/catalog";
import type { SiteSettings } from "@/server/services/content";
import { useCartUI } from "../cart/cart-provider";
import { useCartLines, useHydrated } from "../cart/cart-store";
import { Sheet } from "../ui/sheet";
import { Logo } from "./logo";
import { SearchPanel } from "./search-panel";

type SiteHeaderProps = {
  categories: CategoryLink[];
  contact: SiteSettings["contact"];
  socials: SiteSettings["socials"];
  store: SiteSettings["store"];
};

// 44 px en el teléfono: así entran 3 íconos a la derecha con el logo centrado desde 385 px de ancho.
const iconButton = "relative grid size-11 place-items-center transition-transform active:scale-90 lg:size-12";

/** El ícono del carrito "salta" cuando se agrega una prenda (no al cargar la página). */
function useCartBump(units: number) {
  const ref = useRef<HTMLSpanElement>(null);
  const previous = useRef<number | null>(null);
  const hydrated = useHydrated();
  useEffect(() => {
    if (!hydrated) return;
    const grew = previous.current !== null && units > previous.current;
    previous.current = units;
    if (!grew || !ref.current || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    ref.current.animate(
      [{ transform: "scale(1)" }, { transform: "scale(1.25) rotate(-8deg)" }, { transform: "scale(0.95)" }, { transform: "scale(1)" }],
      { duration: 450, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" },
    );
  }, [units, hydrated]);
  return ref;
}

const MORE_LINKS = [
  { href: "/cuenta", label: "Mi cuenta", icon: UserRound },
  { href: "/tracking", label: "Rastrear pedido", icon: PackageSearch },
  { href: "/contacto", label: "Contacto", icon: Mail },
  { href: "/nosotros", label: "Nosotros", icon: Info },
  { href: "/blogs", label: "Blog", icon: BookOpen },
];

export function SiteHeader({ categories, contact, socials, store }: SiteHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const { openCart } = useCartUI();
  const { units } = cartTotals(useCartLines());
  const bumpRef = useCartBump(units);
  const closeMenu = () => setMenuOpen(false);

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-ink/90 backdrop-blur-md print:hidden">
      <div className="mx-auto grid h-14 max-w-7xl 2xl:max-w-[96rem] grid-cols-[1fr_auto_1fr] items-center px-1 lg:flex lg:gap-8 lg:px-6">
        <button type="button" onClick={() => setMenuOpen(true)} aria-label="Abrir menú" className={`${iconButton} lg:hidden`}>
          <Menu className="size-6" aria-hidden />
        </button>

        <Link href="/" aria-label="TWENTY, ir al inicio" className="flex h-12 items-center justify-self-center">
          <Logo priority className="w-24 min-[340px]:w-28 lg:w-32" />
        </Link>

        <nav aria-label="Categorías" className="hidden min-w-0 flex-1 lg:block">
          <ul className="flex items-center gap-6 text-xs font-semibold tracking-widest uppercase">
            <li>
              <Link href="/catalogo" className="py-4 hover:text-muted">
                Todo
              </Link>
            </li>
            {/* Escritorio: 7 categorías; en pantallas más anchas entran todas. */}
            {categories.map((c, i) => (
              <li key={c.slug} className={i >= 7 ? "hidden xl:list-item" : undefined}>
                <Link href={catalogUrl({ categoria: c.slug })} className="py-4 hover:text-muted">
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex items-center justify-self-end">
          <button type="button" onClick={() => setSearchOpen(true)} aria-label="Buscar" className={iconButton}>
            <Search className="size-[22px]" aria-hidden />
          </button>
          {/* En teléfonos de menos de 385 px no entra un tercer ícono: "Mi cuenta" está en el menú. */}
          <Link href="/cuenta" aria-label="Mi cuenta" className={`${iconButton} max-[384px]:hidden`}>
            <UserRound className="size-[22px]" aria-hidden />
          </Link>
          <button
            type="button"
            onClick={() => openCart()}
            aria-label={units ? `Carrito, ${units} ${units === 1 ? "prenda" : "prendas"}` : "Carrito vacío"}
            className={iconButton}
          >
            <span ref={bumpRef} className="grid place-items-center">
              <ShoppingBag className="size-[22px]" aria-hidden />
            </span>
            {units ? (
              <span
                key={units}
                className="absolute top-2 right-1.5 grid h-[18px] min-w-[18px] animate-fade-in place-items-center rounded-full bg-white px-1 text-[10px] font-bold text-black tabular-nums"
              >
                {units}
              </span>
            ) : null}
          </button>
        </div>
      </div>

      <Sheet open={menuOpen} onClose={closeMenu} side="left" title="Menú">
        <nav aria-label="Menú principal" className="px-2 py-2">
          <ul>
            <li>
              <Link href="/catalogo" onClick={closeMenu} className="flex h-14 items-center justify-between rounded-lg px-3 font-semibold">
                Ver todo el catálogo <ChevronRight className="size-5 text-subtle" aria-hidden />
              </Link>
            </li>
            {categories.map((c) => (
              <li key={c.slug}>
                <Link
                  href={catalogUrl({ categoria: c.slug })}
                  onClick={closeMenu}
                  className="flex h-16 items-center gap-3 rounded-lg px-3 hover:bg-raised"
                >
                  <span className="relative size-11 shrink-0 overflow-hidden rounded-full bg-raised">
                    {c.image ? <Image src={c.image} alt="" fill sizes="44px" className="object-cover" /> : null}
                  </span>
                  <span className="flex-1">{c.name}</span>
                  <span className="text-xs text-subtle tabular-nums">{c.productCount}</span>
                  <ChevronRight className="size-5 text-subtle" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
          <ul className="mt-2 grid grid-cols-2 gap-2 border-t border-line px-1 pt-4">
            {MORE_LINKS.map(({ href, label, icon: Icon }) => (
              <li key={href}>
                <Link href={href} onClick={closeMenu} className="flex h-12 items-center gap-2 rounded-lg px-2 text-sm hover:bg-raised">
                  <Icon className="size-4 text-muted" aria-hidden /> {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="mx-4 mt-2 mb-6 space-y-4 border-t border-line pt-6 text-sm">
          {contact.whatsapp ? (
            <a
              href={whatsappUrl(contact.whatsapp, contact.whatsappMessage)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-12 items-center justify-center gap-2 rounded-full border border-line font-semibold"
            >
              <MessageCircle className="size-5" aria-hidden /> Escríbenos por WhatsApp
            </a>
          ) : null}
          {store ? (
            <a href={mapsUrl(store.latitude, store.longitude)} target="_blank" rel="noopener noreferrer" className="flex gap-3 text-muted">
              <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                <span className="block text-white">Tienda en Gamarra</span>
                {store.address}
              </span>
            </a>
          ) : null}
          {contact.openingHours ? (
            <p className="flex gap-3 text-muted">
              <Clock className="mt-0.5 size-4 shrink-0" aria-hidden /> {contact.openingHours}
            </p>
          ) : null}
          {socials.length ? (
            <ul className="flex gap-4 pt-2">
              {socials.map((s) => (
                <li key={s.url}>
                  <a href={s.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">
                    {s.name}
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </Sheet>

      <SearchPanel open={searchOpen} onClose={() => setSearchOpen(false)} categories={categories} />
    </header>
  );
}
