"use client";

import { MapPin, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { matchesAllWords, normalizeText } from "@/lib/slug";
import { inputClass } from "../ui/form";

type DistrictRow = [ubigeo: string, name: string, province: string, department: string];
export type PickedDistrict = { ubigeo: string; label: string; department: string };

let districtsPromise: Promise<DistrictRow[]> | null = null;
function loadDistricts() {
  districtsPromise ??= fetch("/api/districts")
    .then((r) => (r.ok ? (r.json() as Promise<DistrictRow[]>) : []))
    .catch(() => {
      districtsPromise = null;
      return [];
    });
  return districtsPromise;
}

export const districtLabel = (d: DistrictRow) => `${d[1]}, ${d[2]} - ${d[3]}`;

type DistrictSearchProps = {
  id: string;
  value: PickedDistrict | null;
  onChange: (value: PickedDistrict | null) => void;
  invalid?: boolean;
  describedBy?: string;
};

/** Buscador de distrito (los 1,893 del Perú). Se escribe "surco" o "arequipa" y se elige. */
export function DistrictSearch({ id, value, onChange, invalid, describedBy }: DistrictSearchProps) {
  const [rows, setRows] = useState<DistrictRow[]>([]);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let active = true;
    loadDistricts().then((data) => {
      if (active) setRows(data);
    });
    return () => {
      active = false;
    };
  }, []);

  if (value) {
    return (
      <div className="flex h-12 items-center gap-3 rounded-xl border border-white bg-raised px-4">
        <MapPin className="size-4 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-sm">{value.label}</span>
        <button type="button" onClick={() => onChange(null)} className="text-sm underline underline-offset-4">
          Cambiar
        </button>
      </div>
    );
  }

  // Primero el distrito que se llama así, luego los que empiezan igual, luego el resto (provincia o departamento).
  const q = normalizeText(query.trim());
  const rank = (r: DistrictRow) => {
    const name = normalizeText(r[1]);
    return name === q ? 0 : name.startsWith(q) ? 1 : name.includes(q) ? 2 : 3;
  };
  const results =
    q.length >= 2
      ? rows
          .filter((r) => matchesAllWords(districtLabel(r), query))
          .sort((a, b) => rank(a) - rank(b))
          .slice(0, 8)
      : [];

  return (
    <div>
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted" aria-hidden />
        <input
          id={id}
          type="search"
          autoComplete="off"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Escribe tu distrito o ciudad"
          aria-invalid={invalid}
          aria-describedby={describedBy}
          className={`${inputClass} pl-11`}
        />
      </div>
      {results.length ? (
        <ul className="mt-2 overflow-hidden rounded-xl border border-line" role="listbox" aria-label="Distritos">
          {results.map((r) => (
            <li key={r[0]}>
              <button
                type="button"
                role="option"
                aria-selected={false}
                onClick={() => {
                  onChange({ ubigeo: r[0], label: districtLabel(r), department: r[3] });
                  setQuery("");
                }}
                className="flex w-full flex-col items-start border-b border-line px-4 py-3 text-left last:border-0 hover:bg-raised"
              >
                <span className="text-sm">{r[1]}</span>
                <span className="text-xs text-muted">
                  {r[2]}, {r[3]}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : query.trim().length >= 2 && rows.length ? (
        <p className="mt-2 text-sm text-muted">No encontramos “{query}”. Prueba solo con el nombre del distrito.</p>
      ) : null}
    </div>
  );
}
