"use client";

import type { ReactNode } from "react";
import { PRICE_RANGES, type CatalogFilters, type Facets, type PriceRangeKey } from "@/lib/catalog-filters";
import { promotionLabel } from "../store/price";
import { Sheet } from "../ui/sheet";
import { Chip } from "./chip";

type FilterSheetProps = {
  open: boolean;
  onClose: () => void;
  filters: CatalogFilters;
  facets: Facets;
  resultCount: number;
  onChange: (patch: Partial<CatalogFilters>) => void;
  onClear: () => void;
};

const toggle = (list: string[], value: string) => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="min-w-0 border-b border-line px-4 py-5 last:border-0">
      <legend className="float-left mb-3 w-full text-xs font-semibold tracking-widest text-muted uppercase">{title}</legend>
      <div className="clear-both flex flex-wrap gap-2">{children}</div>
    </fieldset>
  );
}

/** Los filtros se aplican al instante; el botón de abajo muestra cuántas prendas quedan. */
export function FilterSheet({ open, onClose, filters, facets, resultCount, onChange, onClear }: FilterSheetProps) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      side="bottom"
      title="Filtros"
      footer={
        <div className="flex gap-3">
          <button type="button" onClick={onClear} className="h-12 flex-1 rounded-full border border-line text-sm font-semibold">
            Limpiar
          </button>
          <button type="button" onClick={onClose} className="h-12 flex-2 rounded-full bg-white text-sm font-semibold text-black">
            {resultCount === 0 ? "Sin resultados" : `Ver ${resultCount} ${resultCount === 1 ? "prenda" : "prendas"}`}
          </button>
        </div>
      }
    >
      {facets.tallas.length ? (
        <Group title="Talla">
          {facets.tallas.map((t) => (
            <Chip
              key={t.label}
              active={filters.tallas.includes(t.label)}
              onClick={() => onChange({ tallas: toggle(filters.tallas, t.label) })}
              className="min-w-14 justify-center px-3"
            >
              {t.label}
            </Chip>
          ))}
        </Group>
      ) : null}

      {facets.fits.length > 1 ? (
        <Group title="Fit">
          {facets.fits.map((f) => (
            <Chip key={f.slug} active={filters.fits.includes(f.slug)} count={f.count} onClick={() => onChange({ fits: toggle(filters.fits, f.slug) })}>
              {f.name}
            </Chip>
          ))}
        </Group>
      ) : null}

      {facets.colores.length ? (
        <Group title="Color">
          {facets.colores.map((c) => (
            <Chip
              key={c.slug}
              active={filters.colores.includes(c.slug)}
              swatch={c.hex}
              count={c.count}
              onClick={() => onChange({ colores: toggle(filters.colores, c.slug) })}
            >
              {c.name}
            </Chip>
          ))}
        </Group>
      ) : null}

      <Group title="Precio">
        {(Object.keys(PRICE_RANGES) as PriceRangeKey[]).map((key) => (
          <Chip key={key} active={filters.precio === key} onClick={() => onChange({ precio: filters.precio === key ? null : key })}>
            {PRICE_RANGES[key].label}
          </Chip>
        ))}
      </Group>

      {facets.promos.length ? (
        <Group title="Promociones">
          {facets.promos.map((p) => (
            <Chip key={p.id} active={filters.promo === p.id} count={p.count} onClick={() => onChange({ promo: filters.promo === p.id ? null : p.id })}>
              {promotionLabel(p)} · {p.categories.join(", ")}
            </Chip>
          ))}
        </Group>
      ) : null}
    </Sheet>
  );
}
