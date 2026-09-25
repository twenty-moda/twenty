/**
 * Olva Courier (envíos a todo el Perú) a través de Olva API (api.olva-api.lat, servicio de terceros, no de Olva;
 * llave en OLVA_API_KEY, plan con cuota mensual). Se usa para:
 * - La lista de agencias de destino que el cliente elige en el checkout (en lugar de escribirla).
 * - El seguimiento de la guía (N° de tracking + año de emisión) en la página del pedido.
 * La API también registra envíos (guía, rótulo y correos de Olva al remitente y al destinatario), pero pide los datos
 * de TWENTY como remitente (DNI o RUC y la sede de origen): pendiente.
 */
import type { CourierAgency, CourierTracking, TrackingStep } from "@/lib/couriers";
import { districtIndex, norm, sortAgencies, titleCase, toCoordinate, type DistrictRow } from "./couriers";

const API = "https://api.olva-api.lat";

type Hours = { open?: string | null; close?: string | null } | null;
type RawAgency = {
  code?: string | number | null;
  name?: string | null;
  department?: string | null;
  province?: string | null;
  district?: string | null;
  address?: string | null;
  schedule?: Record<string, Hours> | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
};

export type OlvaClient = {
  listAgencies(): Promise<RawAgency[]>;
  /** `year`: año de emisión de la guía, 2 dígitos. */
  track(trackingNumber: string, year: string): Promise<CourierTracking | null>;
};

export class OlvaApiError extends Error {}

export function olvaClient(apiKey: string, fetchImpl: typeof fetch = fetch): OlvaClient {
  const call = async (path: string, init?: RequestInit) => {
    const res = await fetchImpl(`${API}${path}`, {
      ...init,
      headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(30_000),
    });
    const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    return { status: res.status, body };
  };
  return {
    async listAgencies() {
      const { status, body } = await call("/agencies");
      if (status !== 200 || !Array.isArray(body?.data)) throw new OlvaApiError(`Olva respondió ${status} al pedir las agencias`);
      return body.data as RawAgency[];
    },
    async track(trackingNumber, year) {
      const { status, body } = await call("/track", { method: "POST", body: JSON.stringify({ orderNumber: trackingNumber, orderCode: year }) });
      if (status === 404) return null;
      if (status !== 200) throw new OlvaApiError(`Olva respondió ${status} al rastrear`);
      return parseTracking(body);
    },
  };
}

export function olvaFromEnv(): OlvaClient | null {
  const key = process.env.OLVA_API_KEY;
  return key ? olvaClient(key) : null;
}

// ─── Agencias ────────────────────────────────────────────────────────────────

const squash = (value: unknown) => String(value ?? "").replace(/\s+/g, " ").trim();
/** Una parte del nombre que es una dirección: "JR. ANTONIO BAZO 1278", "AV LIMA", "CA POMACANCHI S/N"… */
const STREET = /^(AV|AVDA|AVENIDA|JR|JIRON|CA|CALLE|CL|PJ|PSJE|PASAJE|MZ|URB|URBANIZACION|CR|CARRETERA|PROLONGACION|PROL|ASOC|ASOCIACION|KM|PANAMERICANA)\b/;

/**
 * El nombre de la agencia sin la dirección que Olva le pega detrás ni "Tienda"/"Olva" delante:
 * "TIENDA CHACHAPOYAS - JR. ORTIZ ARRIETA Nº 270" → "Chachapoyas", "AGENTE OLVA BREÑA - FERNANDINI" → "Agente Breña - Fernandini".
 */
export function agencyName(rawName: string, rawAddress: string, rawDistrict = ""): string {
  let name = squash(rawName);
  const address = squash(rawAddress);
  const upper = name.toUpperCase();
  // La dirección va al final (a veces cortada, porque Olva limita el nombre a 100 letras).
  const at = address.length >= 6 ? upper.lastIndexOf(address.slice(0, 12).toUpperCase()) : -1;
  if (at > 0) name = name.slice(0, at).replace(/[\s,-]+$/, "");
  // Si la dirección del nombre está escrita distinto que la de la agencia: desde la primera parte que es una calle.
  const parts = name.split(" - ");
  const street = parts.findIndex((part, i) => i > 0 && STREET.test(norm(part)));
  if (street > 0) name = parts.slice(0, street).join(" - ");
  name = name.replace(/^((TIENDA|OLVA)\s+)+/i, "").replace(/^AG(ENTE)?\.?\s+OLVA\b\s*-?\s*/i, "Agente ").trim();
  // "AGENTE AV ARGENTINA - PAUCARPATA" con la dirección "AV ARGENTINA 209": queda "Agente" y se le suma el distrito.
  if (/^(AGENTE|TIENDA|OLVA)?$/i.test(name)) name = `${name} ${squash(rawDistrict)}`.trim();
  return titleCase(name || address);
}

const DAYS = [
  ["monday", "lun"],
  ["tuesday", "mar"],
  ["wednesday", "mié"],
  ["thursday", "jue"],
  ["friday", "vie"],
  ["saturday", "sáb"],
  ["sunday", "dom"],
] as const;
const clock = (value: string) => value.trim().replace(/^0(?=\d)/, "");

/** Horario por día → "Lun a vie 8:00–19:00 · Sáb 8:00–14:30" (los días seguidos con el mismo horario, juntos). */
export function scheduleText(schedule: Record<string, Hours> | null | undefined): string | null {
  if (!schedule || typeof schedule !== "object") return null;
  const groups: { from: number; to: number; hours: string }[] = [];
  DAYS.forEach(([key], i) => {
    const day = schedule[key];
    if (!day?.open || !day.close) return;
    const hours = `${clock(day.open)}–${clock(day.close)}`;
    const last = groups.at(-1);
    if (last && last.to === i - 1 && last.hours === hours) last.to = i;
    else groups.push({ from: i, to: i, hours });
  });
  if (!groups.length) return null;
  return groups
    .map(({ from, to, hours }) => {
      const days = from === to ? DAYS[from][1] : `${DAYS[from][1]} ${to - from === 1 ? "y" : "a"} ${DAYS[to][1]}`;
      return `${days.charAt(0).toUpperCase()}${days.slice(1)} ${hours}`;
    })
    .join(" · ");
}

/** Agencias de Olva con nuestro distrito (por nombre: Olva usa el ubigeo del INEI) y los textos listos para mostrar. */
export function toAgencies(raw: RawAgency[], districts: DistrictRow[]): CourierAgency[] {
  const findUbigeo = districtIndex(districts);
  const ours = new Map(districts.map(([ubigeo, name, province, department]) => [ubigeo, { name, province, department }]));
  const out: CourierAgency[] = [];
  const seen = new Set<string>();
  for (const a of raw) {
    const id = squash(a.code);
    if (!id || seen.has(id)) continue;
    const ubigeo = findUbigeo(squash(a.department), squash(a.province), squash(a.district));
    const place = ubigeo ? ours.get(ubigeo) : undefined;
    if (!ubigeo || !place) continue;
    seen.add(id);
    out.push({
      id,
      name: agencyName(a.name ?? "", a.address ?? "", a.district ?? ""),
      address: titleCase(squash(a.address)),
      hours: scheduleText(a.schedule),
      // Los nombres de nuestra tabla (los mismos del resto del checkout).
      department: place.department,
      province: place.province,
      district: place.name,
      ubigeo,
      lat: toCoordinate(a.latitude),
      lng: toCoordinate(a.longitude),
    });
  }
  return sortAgencies(out);
}

// ─── Seguimiento ─────────────────────────────────────────────────────────────

/** Estados que la API saca del texto de Olva. */
const STATUS_LABEL: Record<string, string> = {
  REGISTERED: "Registrado en Olva",
  IN_TRANSIT: "En camino",
  OUT_FOR_DELIVERY: "En reparto",
  READY_FOR_PICKUP: "Listo para recoger en la agencia",
  DELIVERED: "Entregado",
  RETURNED: "Devuelto al remitente",
  REJECTED: "Rechazado",
};

const pad = (n: number) => String(n).padStart(2, "0");
/** A la hora de Lima (UTC-5, sin horario de verano), como los pasos de Shalom: "2026-08-18 14:05:00" o "2026-08-18". */
export function limaDate(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const v = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const local = v.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(:\d{2})?$/);
  if (local) return `${local[1]} ${local[2]}${local[3] ?? ":00"}`;
  const peruvian = v.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}:\d{2})(:\d{2})?)?$/);
  if (peruvian) return `${peruvian[3]}-${peruvian[2]}-${peruvian[1]}${peruvian[4] ? ` ${peruvian[4]}${peruvian[5] ?? ":00"}` : ""}`;
  const date = new Date(v);
  if (!/(Z|[+-]\d{2}:?\d{2})$/.test(v) || Number.isNaN(date.getTime())) return null;
  const lima = new Date(date.getTime() - 5 * 60 * 60 * 1000);
  return `${lima.getUTCFullYear()}-${pad(lima.getUTCMonth() + 1)}-${pad(lima.getUTCDate())} ${pad(lima.getUTCHours())}:${pad(lima.getUTCMinutes())}:${pad(lima.getUTCSeconds())}`;
}

const dayFormat = new Intl.DateTimeFormat("es-PE", { timeZone: "UTC", day: "numeric", month: "short" });

/**
 * Solo el estado del envío: los pasos (estado, fecha y agencia), el destino y la fecha estimada. No se copian los
 * textos libres de Olva ni los datos del remitente o del destinatario (esto se muestra en la página del pedido).
 */
export function parseTracking(body: unknown): CourierTracking | null {
  const root = (body ?? {}) as { success?: boolean; data?: Record<string, unknown> | null };
  const data = root.data;
  if (root.success === false || !data || typeof data !== "object") return null;

  type RawEvent = { date?: unknown; status?: unknown; location?: unknown };
  let events = (Array.isArray(data.events) ? data.events : []) as RawEvent[];
  const dates = events.map((e) => limaDate(e?.date)).filter((d): d is string => !!d);
  // Del más antiguo al último (si Olva los manda al revés).
  if (dates.length > 1 && dates[0] > dates[dates.length - 1]) events = [...events].reverse();

  const steps: TrackingStep[] = [];
  const seen = new Set<string>();
  for (const e of events) {
    const date = limaDate(e?.date);
    if (!date) continue;
    const status = String(e.status ?? "").toUpperCase();
    const place = typeof e.location === "string" && e.location.trim() ? titleCase(e.location) : null;
    const id = `${status}|${date}|${place}`;
    if (seen.has(id)) continue;
    seen.add(id);
    steps.push({ key: `${steps.length}-${status.toLowerCase() || "paso"}`, label: STATUS_LABEL[status] ?? "Movimiento del envío", date, place });
  }

  const deliveredAt = limaDate(data.deliveredAt);
  const delivered = String(data.status ?? "").toUpperCase() === "DELIVERED" || !!deliveredAt;
  if (delivered && deliveredAt && !steps.some((s) => s.label === STATUS_LABEL.DELIVERED)) {
    steps.push({ key: `${steps.length}-delivered`, label: STATUS_LABEL.DELIVERED, date: deliveredAt, place: null });
  }

  const destination = (data.destination ?? {}) as { agency?: unknown; department?: unknown };
  const destinationText = [destination.agency, destination.department].find((v): v is string => typeof v === "string" && !!v.trim());
  const eta = limaDate(data.estimatedDelivery);
  return {
    delivered,
    destination: destinationText ? titleCase(destinationText) : null,
    eta: eta && !delivered ? `Llegada estimada: ${dayFormat.format(new Date(`${eta.slice(0, 10)}T12:00:00Z`))}` : null,
    steps,
  };
}
