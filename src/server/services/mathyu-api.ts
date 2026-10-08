/**
 * Shalom y Olva por la API de Mathyu's Solutions (MATHYU_API_URL + una llave por courier: MATHYU_SHALOM_API_KEY y
 * MATHYU_OLVA_API_KEY, cada una con su plan), que reemplaza a shalom-api.lat y olva-api.lat: lee las webs de Shalom
 * y Olva directamente. Mismos usos: la lista de agencias de destino del checkout y el seguimiento de la guía. Con la
 * URL y la llave de un courier, `courier-api.ts` la usa para ese courier; sin ellas, sigue la API de terceros
 * (shalom.ts u olva.ts).
 */
import type { Courier, CourierAgency, CourierTracking, TrackingStep } from "@/lib/couriers";
import { districtIndex, sortAgencies, titleCase, toCoordinate, type DistrictRow } from "./couriers";
import { agencyName, scheduleText } from "./olva";

type Hours = { open?: string | null; close?: string | null } | null;
/** Agencia como la devuelve la API (`GET /v1/{courier}/agencies`). */
type ApiAgency = {
  code?: string | null;
  name?: string | null;
  department?: string | null;
  province?: string | null;
  district?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  schedule?: Record<string, Hours> | null;
  /** `false` = solo despacha (Shalom): no se puede elegir como destino. */
  receivesShipments?: boolean;
};
type ApiEvent = { status?: string; rawStatus?: string | null; location?: string | null; at?: string | null };
/** Seguimiento como lo devuelve la API (`POST /v1/{courier}/track`): pasos del más antiguo al más reciente. */
type ApiTracking = { delivered?: boolean; transitTime?: string | null; destination?: string | null; events?: ApiEvent[] };

export type MathyuClient = {
  listAgencies(courier: Courier): Promise<ApiAgency[]>;
  /** Shalom: N° de orden y código; Olva: N° de tracking y año de emisión (2 dígitos). */
  track(courier: Courier, guideNumber: string, guideCode: string): Promise<CourierTracking | null>;
};

export class MathyuApiError extends Error {}

export function mathyuClient(baseUrl: string, apiKey: string, fetchImpl: typeof fetch = fetch): MathyuClient {
  const api = baseUrl.replace(/\/+$/, "");
  const call = async (path: string, init?: RequestInit) => {
    const res = await fetchImpl(`${api}${path}`, {
      ...init,
      headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(30_000),
    });
    const body: unknown = await res.json().catch(() => null);
    return { status: res.status, body };
  };
  return {
    async listAgencies(courier) {
      const { status, body } = await call(`/${courier}/agencies`);
      if (status !== 200 || !Array.isArray(body)) throw new MathyuApiError(`La API respondió ${status} al pedir las agencias de ${courier}`);
      return body as ApiAgency[];
    },
    async track(courier, guideNumber, guideCode) {
      const { status, body } = await call(`/${courier}/track`, { method: "POST", body: JSON.stringify({ orderNumber: guideNumber, orderCode: guideCode }) });
      if (status === 404) return null;
      if (status !== 200) throw new MathyuApiError(`La API respondió ${status} al rastrear la guía de ${courier}`);
      return parseTracking(courier, body);
    },
  };
}

export function mathyuFromEnv(courier: Courier): MathyuClient | null {
  const url = process.env.MATHYU_API_URL;
  const key = courier === "shalom" ? process.env.MATHYU_SHALOM_API_KEY : process.env.MATHYU_OLVA_API_KEY;
  return url && key ? mathyuClient(url, key) : null;
}

// ─── Agencias ────────────────────────────────────────────────────────────────

const squash = (value: unknown) => String(value ?? "").replace(/\s+/g, " ").trim();

/** Agencias que reciben envíos, con nuestro distrito (por nombre: los couriers usan el ubigeo del INEI) y los textos listos para mostrar. */
export function toAgencies(courier: Courier, raw: ApiAgency[], districts: DistrictRow[]): CourierAgency[] {
  const findUbigeo = districtIndex(districts);
  const ours = new Map(districts.map(([ubigeo, name, province, department]) => [ubigeo, { name, province, department }]));
  const out: CourierAgency[] = [];
  const seen = new Set<string>();
  for (const a of raw) {
    const id = squash(a.code);
    if (!id || seen.has(id) || a.receivesShipments === false) continue;
    const district = squash(a.district);
    const ubigeo = findUbigeo(squash(a.department), squash(a.province), district);
    const place = ubigeo ? ours.get(ubigeo) : undefined;
    if (!ubigeo || !place) continue;
    seen.add(id);
    out.push({
      id,
      // Olva le pega la dirección al nombre; Shalom da el nombre del lugar.
      name: courier === "olva" ? agencyName(a.name ?? "", a.address ?? "", district) : titleCase(squash(a.name) || district),
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

/** Hitos de Shalom (`rawStatus`). */
const SHALOM_STEPS: Record<string, string> = {
  registrado: "Registrado en Shalom",
  origen: "En la agencia de origen",
  transito: "En camino",
  destino: "Llegó a la agencia de destino",
  reparto: "En reparto",
  entregado: "Entregado",
};

/** Estados normalizados de Olva. Los que la API no reconoce (Olva repite "ASIGNADO" en origen y en destino) no se muestran. */
const OLVA_STEPS: Record<string, string> = {
  REGISTERED: "Registrado en Olva",
  IN_TRANSIT: "En camino",
  AT_DESTINATION: "Listo para recoger en la agencia",
  OUT_FOR_DELIVERY: "En reparto",
  DELIVERED: "Entregado",
  RETURNED: "Devuelto al remitente",
  INCIDENT: "Olva anotó una observación",
};

/**
 * Solo el estado del envío: pasos (estado, fecha y, en Olva, agencia), destino y tiempo estimado. La API ya no manda
 * los datos del remitente ni del destinatario (solo con `?raw=1`, que aquí no se pide).
 */
export function parseTracking(courier: Courier, body: unknown): CourierTracking | null {
  const t = body as ApiTracking | null;
  if (!t || typeof t !== "object" || !Array.isArray(t.events)) return null;
  const steps: TrackingStep[] = [];
  for (const e of t.events) {
    const date = typeof e?.at === "string" ? e.at.trim() : "";
    if (!date) continue;
    if (courier === "shalom") {
      const label = SHALOM_STEPS[String(e.rawStatus)];
      if (label) steps.push({ key: String(e.rawStatus), label, date });
      continue;
    }
    // Olva anota varios movimientos internos con el mismo estado: un paso por cada cambio, con la fecha del primero.
    const label = OLVA_STEPS[String(e.status)];
    if (!label || steps.at(-1)?.label === label) continue;
    const place = typeof e.location === "string" && e.location.trim() ? titleCase(e.location) : null;
    steps.push({ key: `${steps.length}-${String(e.status).toLowerCase()}`, label, date, place });
  }
  const delivered = t.delivered === true;
  const transitTime = typeof t.transitTime === "string" ? t.transitTime.trim() : "";
  return {
    delivered,
    destination: typeof t.destination === "string" && t.destination.trim() ? titleCase(t.destination) : null,
    eta: transitTime && !delivered ? `Tiempo estimado: ${transitTime}` : null,
    steps,
  };
}
