"use client";

import { Check, Clock, LocateFixed, MapPin, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { matchesAllWords, normalizeText } from "@/lib/slug";
import { COURIER_NAME, type Courier, type CourierAgency } from "@/lib/couriers";
import { inputClass } from "../ui/form";

const agenciesPromise: Partial<Record<Courier, Promise<CourierAgency[]>>> = {};
/**
 * La lista (≈500 agencias de Shalom, ≈430 de Olva) se pide una vez, cuando alguien elige ese courier. Viene del CDN
 * (se renueva cada día).
 */
export function loadAgencies(courier: Courier) {
  agenciesPromise[courier] ??= fetch(`/api/${courier}/agencies`)
    .then((r) => (r.ok ? (r.json() as Promise<CourierAgency[]>) : []))
    // Las listas guardadas antes en el CDN traían el id de Shalom como número.
    .then((list) => list.map((a) => ({ ...a, id: String(a.id) })))
    .catch(() => {
      delete agenciesPromise[courier];
      return [];
    });
  return agenciesPromise[courier];
}

const MAX_RESULTS = 12;
const haversineKm = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const rad = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 12_742 * Math.asin(Math.sqrt(h));
};
const searchText = (a: CourierAgency) => `${a.name} ${a.address} ${a.district} ${a.province} ${a.department}`;

type Props = {
  courier: Courier;
  id: string;
  /** Id de la agencia elegida en el courier. */
  value: string;
  onChange: (agency: CourierAgency) => void;
  /** Sin lista (el courier no respondió): el checkout vuelve a pedir la agencia como texto. */
  onUnavailable: (courier: Courier) => void;
  invalid?: boolean;
  describedBy?: string;
};

/**
 * Buscar la agencia de Shalom u Olva por ciudad, distrito o dirección, o las más cercanas con la ubicación del
 * teléfono. Al cambiar de courier va con otra `key` (cada uno tiene sus ids).
 */
export function AgencyPicker({ courier, id, value, onChange, onUnavailable, invalid, describedBy }: Props) {
  const courierName = COURIER_NAME[courier];
  const [agencies, setAgencies] = useState<CourierAgency[] | null>(null);
  const [query, setQuery] = useState("");
  const [near, setNear] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);
  const [changing, setChanging] = useState(false);

  useEffect(() => {
    let active = true;
    loadAgencies(courier).then((list) => {
      if (!active) return;
      if (!list.length) onUnavailable(courier);
      setAgencies(list);
    });
    return () => {
      active = false;
    };
  }, [courier, onUnavailable]);

  if (!agencies) return <div className="h-12 animate-pulse rounded-xl bg-raised" aria-busy="true" aria-label={`Cargando agencias de ${courierName}`} />;

  const selected = agencies.find((a) => a.id === value);
  if (selected && !changing) {
    return (
      <div className="rounded-xl border border-white bg-raised p-4">
        <div className="flex items-start gap-3">
          <Check className="mt-0.5 size-5 shrink-0" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">
              {courierName} {selected.name}
            </p>
            <p className="text-sm text-muted">{selected.address}</p>
            <p className="text-xs text-subtle">
              {selected.district}, {selected.province} - {selected.department}
            </p>
            {selected.hours ? (
              <p className="mt-1 flex items-center gap-1.5 text-xs text-subtle">
                <Clock className="size-3.5 shrink-0" aria-hidden /> {selected.hours}
              </p>
            ) : null}
          </div>
        </div>
        <button type="button" onClick={() => setChanging(true)} className="mt-3 min-h-10 text-sm font-semibold underline underline-offset-4">
          Cambiar agencia
        </button>
      </div>
    );
  }

  const q = query.trim();
  // Por texto: primero las del distrito o la ciudad que se escribió (o la agencia con ese nombre). Con ubicación: las más cercanas.
  const rank = (a: CourierAgency) => {
    const n = normalizeText(q);
    const district = normalizeText(a.district);
    const province = normalizeText(a.province);
    return district === n || province === n ? 0 : normalizeText(a.name).startsWith(n) || district.startsWith(n) || province.startsWith(n) ? 1 : 2;
  };
  const results = near
    ? agencies
        .filter((a) => a.lat !== null && a.lng !== null)
        .map((a) => ({ a, km: haversineKm(near, { lat: a.lat!, lng: a.lng! }) }))
        .filter((x) => !q || matchesAllWords(searchText(x.a), q))
        .sort((x, y) => x.km - y.km)
        .slice(0, MAX_RESULTS)
    : q.length >= 2
      ? agencies
          .filter((a) => matchesAllWords(searchText(a), q))
          .sort((x, y) => rank(x) - rank(y))
          .slice(0, MAX_RESULTS)
          .map((a) => ({ a, km: null as number | null }))
      : [];

  const locate = () => {
    if (!navigator.geolocation) return setLocateError("Tu navegador no comparte la ubicación. Escribe tu ciudad.");
    setLocating(true);
    setLocateError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setNear({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocating(false);
      },
      () => {
        setLocating(false);
        setLocateError("No pudimos ver tu ubicación. Escribe tu ciudad o distrito.");
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 600_000 },
    );
  };

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted" aria-hidden />
        <input
          id={id}
          type="search"
          autoComplete="off"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Tu ciudad, distrito o la dirección de la agencia"
          aria-invalid={invalid}
          aria-describedby={describedBy}
          className={`${inputClass} pl-11`}
        />
      </div>
      <button
        type="button"
        onClick={near ? () => setNear(null) : locate}
        disabled={locating}
        className="flex min-h-10 items-center gap-2 text-sm font-semibold underline underline-offset-4 disabled:opacity-60"
      >
        <LocateFixed className="size-4" aria-hidden /> {locating ? "Buscando tu ubicación…" : near ? "Buscar por nombre en vez de cercanía" : "Ver las agencias más cerca de mí"}
      </button>
      {locateError ? <p className="text-sm text-warning">{locateError}</p> : null}

      {results.length ? (
        <ul className="overflow-hidden rounded-xl border border-line" role="listbox" aria-label={`Agencias de ${courierName}`}>
          {results.map(({ a, km }) => (
            <li key={a.id}>
              <button
                type="button"
                role="option"
                aria-selected={a.id === value}
                onClick={() => {
                  onChange(a);
                  setChanging(false);
                  setQuery("");
                }}
                className={cn("flex w-full items-start gap-3 border-b border-line px-4 py-3 text-left last:border-0 hover:bg-raised", a.id === value && "bg-raised")}
              >
                <MapPin className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">{a.name}</span>
                  <span className="block text-xs text-muted">{a.address}</span>
                  <span className="block text-xs text-subtle">
                    {a.district}, {a.province} - {a.department}
                  </span>
                </span>
                {km !== null ? <span className="shrink-0 text-xs text-muted tabular-nums">{km < 10 ? km.toFixed(1) : Math.round(km)} km</span> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : q.length >= 2 ? (
        <p className="text-sm text-muted">No encontramos agencias con “{q}”. Prueba con el nombre de tu ciudad o provincia.</p>
      ) : !near ? (
        <p className="text-xs text-muted">Escribe tu ciudad (por ejemplo Arequipa, Trujillo o Chiclayo) o usa tu ubicación.</p>
      ) : null}
    </div>
  );
}
