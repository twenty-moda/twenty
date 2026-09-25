"use client";

import { Search, SlidersHorizontal, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import {
  applyFilters,
  buildFacets,
  countActiveFilters,
  EMPTY_FILTERS,
  parseFilters,
  PRICE_RANGES,
  serializeFilters,
  SORT_OPTIONS,
  type CatalogFilters,
  type SortKey,
} from "@/lib/catalog-filters";
import { catalogUrl } from "@/lib/links";
import { useUrlSearch } from "@/lib/use-url-search";
import type { CategoryLink, ProductCard as ProductCardData } from "@/server/services/catalog";
import { promotionLabel } from "../store/price";
import { ProductCard } from "../store/product-card";
import { FilterSheet } from "./filter-sheet";

type CatalogBrowserProps = { products: ProductCardData[]; categories: CategoryLink[]; showPromos: boolean };

/**
 * Catálogo con filtros instantáneos en el navegador: todas las fichas vienen en el HTML estático
 * (bueno para SEO y CDN) y filtrar no hace peticiones. El estado vive en la URL para compartirlo.
 */
export function CatalogBrowser({ products, categories, showPromos }: CatalogBrowserProps) {
  const [search, setSearch] = useUrlSearch();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filters = parseFilters(new URLSearchParams(search));
  const results = applyFilters(products, filters);
  const facets = buildFacets(products, filters);
  const activeCount = countActiveFilters(filters);
  const category = categories.find((c) => c.slug === filters.categoria);

  const update = (patch: Partial<CatalogFilters>) => setSearch(serializeFilters({ ...filters, ...patch }));
  const clearPanel = () => update({ fits: [], tallas: [], colores: [], precio: null, promo: null });
  const selectCategory = (slug: string | null) => {
    update({ categoria: slug, fits: [] });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const activeChips = [
    ...filters.tallas.map((t) => ({ key: `t-${t}`, label: `Talla ${t}`, remove: () => update({ tallas: filters.tallas.filter((x) => x !== t) }) })),
    ...filters.fits.map((f) => ({
      key: `f-${f}`,
      label: facets.fits.find((x) => x.slug === f)?.name ?? f,
      remove: () => update({ fits: filters.fits.filter((x) => x !== f) }),
    })),
    ...filters.colores.map((c) => ({
      key: `c-${c}`,
      label: facets.colores.find((x) => x.slug === c)?.name ?? c,
      remove: () => update({ colores: filters.colores.filter((x) => x !== c) }),
    })),
    ...(filters.precio ? [{ key: "p", label: PRICE_RANGES[filters.precio].label, remove: () => update({ precio: null }) }] : []),
    ...(filters.promo
      ? [
          {
            key: "promo",
            label: (() => {
              const p = facets.promos.find((x) => x.id === filters.promo);
              return p ? `Promo ${promotionLabel(p)}` : "Promo";
            })(),
            remove: () => update({ promo: null }),
          },
        ]
      : []),
  ];

  return (
    <div className="mx-auto max-w-7xl 2xl:max-w-[96rem]">
      <div className="px-4 pt-6 lg:px-6">
        <h1 className="text-2xl font-extrabold tracking-tight uppercase [overflow-wrap:anywhere] md:text-3xl">{category?.name ?? "Catálogo"}</h1>
        <p className="mt-1 text-sm text-muted" aria-live="polite">
          {results.length}{" "}
          {results.length && results.every((r) => r.outfit) ? (results.length === 1 ? "conjunto" : "conjuntos") : results.length === 1 ? "prenda" : "prendas"}
        </p>
      </div>

      <div className="mt-4 px-4 lg:px-6">
        <label className="flex h-11 items-center gap-3 rounded-full bg-raised px-4 md:max-w-md">
          <Search className="size-4 shrink-0 text-muted" aria-hidden />
          <span className="sr-only">Buscar en el catálogo</span>
          <input
            type="search"
            enterKeyHint="search"
            autoComplete="off"
            value={filters.q}
            onChange={(e) => update({ q: e.target.value })}
            placeholder="Buscar prendas, colores, fits…"
            className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-subtle"
          />
          {filters.q ? (
            <button type="button" onClick={() => update({ q: "" })} aria-label="Borrar búsqueda" className="-mr-2 grid size-9 place-items-center">
              <X className="size-4" aria-hidden />
            </button>
          ) : null}
        </label>
      </div>

      <nav aria-label="Categorías" className="no-scrollbar mt-3 flex gap-2 overflow-x-auto px-4 pb-1 lg:flex-wrap lg:px-6">
        <CategoryChip href="/catalogo" active={!filters.categoria} onSelect={() => selectCategory(null)}>
          Todo
        </CategoryChip>
        {/* No es un filtro: lleva a /promos (todas las promos y rebajas, por secciones). */}
        {showPromos ? (
          <Link
            href="/promos"
            className="inline-flex h-10 shrink-0 items-center rounded-full border border-line px-4 text-sm font-semibold whitespace-nowrap text-danger hover:border-white/40"
          >
            Promos
          </Link>
        ) : null}
        {categories.map((c) => (
          <CategoryChip key={c.slug} href={catalogUrl({ categoria: c.slug })} active={c.slug === filters.categoria} onSelect={() => selectCategory(c.slug)}>
            {c.name}
          </CategoryChip>
        ))}
      </nav>

      <div className="sticky top-14 z-30 mt-3 border-y border-line bg-ink/90 backdrop-blur-md">
        <div className="flex h-12 items-center gap-2 px-4 lg:px-6">
          <button type="button" onClick={() => setFiltersOpen(true)} className="inline-flex h-10 items-center gap-2 pr-3 text-sm font-semibold">
            <SlidersHorizontal className="size-4" aria-hidden />
            Filtros
            {activeCount ? (
              <span className="grid size-5 place-items-center rounded-full bg-white text-[11px] font-bold text-black">{activeCount}</span>
            ) : null}
          </button>
          {/* En teléfonos muy angostos la palabra "Ordenar" se oculta (queda para lectores de pantalla). */}
          <label className="ml-auto flex min-w-0 items-center gap-2 text-sm">
            <span className="sr-only text-muted min-[360px]:not-sr-only">Ordenar</span>
            <select
              value={filters.orden}
              onChange={(e) => update({ orden: e.target.value as SortKey })}
              className="h-10 max-w-44 min-w-0 rounded-full border border-line bg-ink px-3 text-sm"
            >
              {(Object.keys(SORT_OPTIONS) as SortKey[]).map((key) => (
                <option key={key} value={key}>
                  {SORT_OPTIONS[key]}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {activeChips.length ? (
        <ul className="no-scrollbar flex gap-2 overflow-x-auto px-4 pt-3 lg:px-6" aria-label="Filtros activos">
          {activeChips.map((chip) => (
            <li key={chip.key}>
              <button
                type="button"
                onClick={chip.remove}
                className="inline-flex h-8 items-center gap-1.5 rounded-full bg-raised pr-2 pl-3 text-xs whitespace-nowrap"
                aria-label={`Quitar filtro ${chip.label}`}
              >
                {chip.label} <X className="size-3.5" aria-hidden />
              </button>
            </li>
          ))}
          <li>
            <button type="button" onClick={clearPanel} className="h-8 px-2 text-xs whitespace-nowrap underline underline-offset-4">
              Limpiar todo
            </button>
          </li>
        </ul>
      ) : null}

      {results.length ? (
        <ul className="grid grid-cols-2 gap-x-3 gap-y-7 px-4 pt-4 md:grid-cols-3 lg:grid-cols-4 lg:gap-x-4 lg:px-6 2xl:grid-cols-5">
          {results.map((product, i) => (
            <li key={product.id} className="reveal">
              <ProductCard product={product} eager={i < 4} morph sizes="(min-width: 1536px) 20vw, (min-width: 1024px) 25vw, (min-width: 768px) 33vw, 50vw" />
            </li>
          ))}
        </ul>
      ) : (
        <div className="px-4 py-20 text-center">
          <p className="font-semibold">No encontramos prendas con esos filtros</p>
          <p className="mt-1 text-sm text-muted">Prueba quitando alguno o busca otra cosa.</p>
          <button
            type="button"
            onClick={() => setSearch(serializeFilters({ ...EMPTY_FILTERS, categoria: filters.categoria }))}
            className="mt-6 inline-flex h-12 items-center rounded-full bg-white px-8 text-sm font-semibold text-black"
          >
            Quitar filtros
          </button>
        </div>
      )}

      <FilterSheet
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        filters={filters}
        facets={facets}
        resultCount={results.length}
        onChange={update}
        onClear={clearPanel}
      />
    </div>
  );
}

/** Enlace real (rastreable) que en el navegador filtra sin recargar. */
function CategoryChip({ href, active, onSelect, children }: { href: string; active: boolean; onSelect: () => void; children: React.ReactNode }) {
  return (
    <a
      href={href}
      aria-current={active ? "page" : undefined}
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey) return;
        event.preventDefault();
        onSelect();
      }}
      className={
        active
          ? "inline-flex h-10 shrink-0 items-center rounded-full border border-white bg-white px-4 text-sm font-semibold whitespace-nowrap text-black"
          : "inline-flex h-10 shrink-0 items-center rounded-full border border-line px-4 text-sm whitespace-nowrap hover:border-white/40"
      }
    >
      {children}
    </a>
  );
}
