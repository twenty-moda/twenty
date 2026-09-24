"use client";

import { ArrowRight, Search, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { catalogUrl } from "@/lib/links";
import { formatPrice } from "@/lib/money";
import { searchEntries, type SearchEntry } from "@/lib/search";
import type { CategoryLink } from "@/server/services/catalog";
import { Sheet } from "../ui/sheet";

let indexPromise: Promise<SearchEntry[]> | null = null;
function loadIndex() {
  indexPromise ??= fetch("/api/search-index")
    .then((r) => (r.ok ? (r.json() as Promise<SearchEntry[]>) : []))
    .catch(() => {
      indexPromise = null;
      return [];
    });
  return indexPromise;
}

type SearchPanelProps = { open: boolean; onClose: () => void; categories: CategoryLink[] };

export function SearchPanel({ open, onClose, categories }: SearchPanelProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [entries, setEntries] = useState<SearchEntry[]>([]);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    let active = true;
    loadIndex().then((data) => {
      if (active) setEntries(data);
    });
    return () => {
      active = false;
    };
  }, [open]);

  const results = searchEntries(entries, query);
  const close = () => {
    setQuery("");
    onClose();
  };

  return (
    <Sheet open={open} onClose={close} side="bottom" title="Buscar" className="md:max-w-lg">
      <form
        role="search"
        className="sticky top-0 z-10 bg-surface px-4 pt-4 pb-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (!query.trim()) return;
          router.push(catalogUrl({ q: query.trim() }));
          close();
        }}
      >
        <label className="flex h-12 items-center gap-3 rounded-full bg-raised px-4">
          <Search className="size-5 shrink-0 text-muted" aria-hidden />
          <span className="sr-only">Buscar prendas</span>
          <input
            ref={inputRef}
            type="search"
            enterKeyHint="search"
            autoComplete="off"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Baggy, polo, hoodie negro…"
            className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-subtle"
          />
          {query ? (
            <button type="button" onClick={() => setQuery("")} aria-label="Borrar búsqueda" className="-mr-2 grid size-9 place-items-center">
              <X className="size-4" aria-hidden />
            </button>
          ) : null}
        </label>
      </form>

      <div className="px-4 pb-6">
        {!query.trim() ? (
          <section>
            <h3 className="mb-3 text-xs font-semibold tracking-widest text-muted uppercase">Explora</h3>
            <ul className="flex flex-wrap gap-2">
              {categories.map((c) => (
                <li key={c.slug}>
                  <Link
                    href={catalogUrl({ categoria: c.slug })}
                    onClick={close}
                    className="inline-flex h-10 items-center rounded-full border border-line px-4 text-sm"
                  >
                    {c.name}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : results.length ? (
          <>
            <p className="mb-2 text-xs text-muted" aria-live="polite">
              {results.length} {results.length === 1 ? "resultado" : "resultados"}
            </p>
            <ul className="divide-y divide-line">
              {results.slice(0, 8).map((r) => (
                <li key={r.slug}>
                  <Link href={`/product/${r.slug}`} onClick={close} className="flex items-center gap-3 py-3">
                    <span className="relative aspect-3/4 w-12 shrink-0 overflow-hidden rounded bg-raised">
                      {r.image ? <Image src={r.image} alt="" fill sizes="48px" className="object-cover" /> : null}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{r.name}</span>
                      <span className="block text-xs text-muted">
                        {r.category}
                        {r.fit ? ` · ${r.fit}` : ""}
                      </span>
                    </span>
                    <span className="text-sm font-semibold">{r.inStock ? formatPrice(r.priceCents) : "Agotado"}</span>
                  </Link>
                </li>
              ))}
            </ul>
            {results.length > 8 ? (
              <Link
                href={catalogUrl({ q: query.trim() })}
                onClick={close}
                className="mt-3 flex h-12 items-center justify-center gap-2 rounded-full border border-line text-sm font-semibold"
              >
                Ver los {results.length} resultados <ArrowRight className="size-4" aria-hidden />
              </Link>
            ) : null}
          </>
        ) : entries.length ? (
          <p className="py-8 text-center text-sm text-muted" aria-live="polite">
            No encontramos “{query}”. Prueba con otra palabra o explora el catálogo.
          </p>
        ) : null}
      </div>
    </Sheet>
  );
}
