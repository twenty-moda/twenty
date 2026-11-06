"use client";

import { Search } from "lucide-react";
import { useState, type ReactNode } from "react";
import { buttonClass } from "@/components/admin/ui";
import { inputClass } from "@/components/ui/form";
import { cn } from "@/lib/cn";
import { formatPrice } from "@/lib/money";
import { matchesAllWords } from "@/lib/slug";

export type ProductOption = { id: string; name: string; status: string; categoryName: string; minPrice: number | null };

/**
 * Lista de productos con buscador y «Todos <categoría>» para elegir varios (promociones, cupones). Manda los elegidos
 * en campos ocultos con el nombre `name`.
 */
export function ProductPicker({
  name,
  legend,
  products,
  selected,
  onChange,
  error,
}: {
  name: string;
  legend: string;
  products: ProductOption[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  error?: ReactNode;
}) {
  const [query, setQuery] = useState("");
  const visible = products.filter((x) => matchesAllWords(`${x.name} ${x.categoryName}`, query));
  const categories = [...new Set(products.map((x) => x.categoryName))];
  const toggle = (ids: string[], on: boolean) => {
    const next = new Set(selected);
    for (const i of ids) {
      if (on) next.add(i);
      else next.delete(i);
    }
    onChange(next);
  };

  return (
    <fieldset className="min-w-0 space-y-3">
      {[...selected].map((id) => (
        <input key={id} type="hidden" name={name} value={id} />
      ))}
      <legend className="text-sm font-medium">
        {legend} <span className="text-muted">({selected.size} elegidos)</span>
      </legend>
      {error}
      <div className="flex flex-wrap gap-2">
        {categories.map((c) => {
          const ids = products.filter((x) => x.categoryName === c).map((x) => x.id);
          const all = ids.every((i) => selected.has(i));
          return (
            <button key={c} type="button" onClick={() => toggle(ids, !all)} className={cn(buttonClass("secondary", "sm"), all && "border-white")}>
              {all ? "Quitar" : "Todos"} {c}
            </button>
          );
        })}
      </div>
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted" aria-hidden />
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar producto" className={cn(inputClass, "pl-11")} />
      </div>
      <ul className="max-h-80 divide-y divide-line overflow-y-auto rounded-xl border border-line">
        {visible.map((x) => (
          <li key={x.id}>
            <label className="flex cursor-pointer items-center gap-3 px-4 py-3 text-sm hover:bg-raised">
              <input type="checkbox" checked={selected.has(x.id)} onChange={(e) => toggle([x.id], e.target.checked)} className="size-5 accent-white" />
              <span className="min-w-0 flex-1">
                <span className="block truncate">{x.name}</span>
                <span className="block text-xs text-muted">
                  {x.categoryName}
                  {x.status !== "active" ? " · no publicado" : ""}
                </span>
              </span>
              <span className="text-muted">{x.minPrice ? formatPrice(x.minPrice) : "—"}</span>
            </label>
          </li>
        ))}
      </ul>
    </fieldset>
  );
}
