/**
 * Shalom (envíos a provincia) a través de Shalom API Perú (api.shalom-api.lat, servicio de terceros sobre los datos
 * de shalom.com.pe; llave en SHALOM_API_KEY, plan con cuota mensual). Se usa para:
 * - La lista de agencias de destino que el cliente elige en el checkout (en lugar de escribirla).
 * - El seguimiento de la guía (número de orden + código) en la página del pedido.
 * Crear la guía en Shalom Pro también se puede con esta API, pero pide las credenciales de Shalom Pro de TWENTY.
 */
import type { ShalomAgency, ShalomStepKey, ShalomTracking } from "@/lib/shalom";
import { normalizeText } from "@/lib/slug";

export type { ShalomAgency, ShalomTracking } from "@/lib/shalom";

const API = "https://api.shalom-api.lat";


type RawAgency = {
  ter_id: number;
  nombre?: string | null;
  lugar_over?: string | null;
  zona?: string | null;
  departamento?: string | null;
  provincia?: string | null;
  direccion?: string | null;
  hora_atencion?: string | null;
  latitud?: string | number | null;
  longitud?: string | number | null;
  destino?: number | string | null;
};

export type ShalomClient = {
  listAgencies(): Promise<RawAgency[]>;
  track(orderNumber: string, orderCode: string): Promise<ShalomTracking | null>;
};

export class ShalomApiError extends Error {}

export function shalomClient(apiKey: string, fetchImpl: typeof fetch = fetch): ShalomClient {
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
      if (status !== 200 || !Array.isArray(body?.data)) throw new ShalomApiError(`Shalom respondió ${status} al pedir las agencias`);
      return body.data as RawAgency[];
    },
    async track(orderNumber, orderCode) {
      const { status, body } = await call("/track", { method: "POST", body: JSON.stringify({ orderNumber, orderCode }) });
      if (status === 404) return null;
      if (status !== 200) throw new ShalomApiError(`Shalom respondió ${status} al rastrear`);
      return parseTracking(body);
    },
  };
}

export function shalomFromEnv(): ShalomClient | null {
  const key = process.env.SHALOM_API_KEY;
  return key ? shalomClient(key) : null;
}

// ─── Agencias ────────────────────────────────────────────────────────────────

const norm = (value: unknown) =>
  normalizeText(String(value ?? ""))
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Nombres de distrito que Shalom escribe distinto. */
const DISTRICT_ALIASES: Record<string, string> = {
  "ATE VITARTE": "ATE",
  "CERCADO LIMA": "LIMA",
  "CERCADO DE LIMA": "LIMA",
  "26 DE OCTUBRE": "VEINTISEIS DE OCTUBRE",
};

const SMALL_WORDS = new Set(["de", "del", "la", "las", "los", "y", "el", "en", "a"]);
/** "AV. PARRA 379 - AREQUIPA" → "Av. Parra 379 - Arequipa". */
export function titleCase(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((word, i) => (i > 0 && SMALL_WORDS.has(word) ? word : word.replace(/^(\p{L})/u, (c) => c.toUpperCase())))
    .join(" ");
}

type DistrictRow = [ubigeo: string, name: string, province: string, department: string];

/**
 * Nuestro distrito para una agencia, por nombre (los códigos no sirven: RENIEC vs. INEI). Shalom corta los nombres
 * a 20 letras y usa algunos nombres propios: se prueba exacto, luego por prefijo y, si no, la capital de la provincia.
 */
export function districtIndex(rows: DistrictRow[]) {
  const byDepartment = new Map<string, { ubigeo: string; name: string; province: string }[]>();
  for (const [ubigeo, name, province, department] of rows) {
    const list = byDepartment.get(norm(department)) ?? [];
    list.push({ ubigeo, name: norm(name), province: norm(province) });
    byDepartment.set(norm(department), list);
  }
  const samePrefix = (a: string, b: string) => a.length >= 4 && b.length >= 4 && (a.startsWith(b) || b.startsWith(a));

  return (department: string, province: string, district: string): string | null => {
    const candidates = byDepartment.get(norm(department)) ?? [];
    const prov = norm(province);
    const inProvince = candidates.filter((d) => d.province === prov);
    const provinceRows = inProvince.length ? inProvince : candidates.filter((d) => samePrefix(d.province, prov));
    if (!provinceRows.length) return null;
    let dist = norm(district);
    dist = DISTRICT_ALIASES[dist] ?? dist.replace(/^(PUCALLPA|BAJO) /, "");
    const match =
      provinceRows.find((d) => d.name === dist) ??
      provinceRows.find((d) => samePrefix(d.name, dist)) ??
      provinceRows.find((d) => d.name === provinceRows[0].province) ??
      provinceRows[0];
    return match.ubigeo;
  };
}

/** Coordenadas con 5 decimales (≈1 m): la lista pesa menos. */
const toCoordinate = (value: unknown) => {
  const n = Number(value);
  return Number.isFinite(n) && n !== 0 ? Math.round(n * 1e5) / 1e5 : null;
};

/** "LUNES A VIERNES - 7:00 AM A 8:00 PM" → "Lunes a viernes - 7:00 AM a 8:00 PM". */
export function hoursText(value: string): string {
  const lower = value.trim().replace(/\s+/g, " ").toLowerCase().replace(/(?<=[\d\s])(a|p)\.?\s?m\b\.?/g, (_, x: string) => `${x.toUpperCase()}M`);
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/** Agencias que reciben envíos, con nuestro distrito y los textos listos para mostrar. */
export function toAgencies(raw: RawAgency[], districts: DistrictRow[]): ShalomAgency[] {
  const findUbigeo = districtIndex(districts);
  const ours = new Map(districts.map(([ubigeo, name, province, department]) => [ubigeo, { name, province, department }]));
  const out: ShalomAgency[] = [];
  for (const a of raw) {
    if (Number(a.destino) !== 1 || !a.ter_id) continue;
    // "DEPARTAMENTO / PROVINCIA / DISTRITO / LUGAR"
    const [department = a.departamento ?? "", province = a.provincia ?? "", district = a.zona ?? ""] = String(a.nombre ?? "").split("/").map((s) => s.trim());
    const ubigeo = findUbigeo(department, province, district);
    const place = ubigeo ? ours.get(ubigeo) : undefined;
    if (!ubigeo || !place) continue;
    out.push({
      id: Number(a.ter_id),
      name: titleCase(a.lugar_over || district),
      address: titleCase(a.direccion ?? ""),
      hours: a.hora_atencion?.trim() ? hoursText(a.hora_atencion) : null,
      // Los nombres de nuestra tabla (los mismos del resto del checkout), no los abreviados de Shalom.
      department: place.department,
      province: place.province,
      district: place.name,
      ubigeo,
      lat: toCoordinate(a.latitud),
      lng: toCoordinate(a.longitud),
    });
  }
  return out.sort((x, y) => x.department.localeCompare(y.department, "es") || x.province.localeCompare(y.province, "es") || x.name.localeCompare(y.name, "es"));
}


/**
 * La agencia de un pedido con Shalom: la elegida de la lista (su nombre y distrito oficiales, no lo que mande el
 * navegador). Sin lista (Shalom no respondió) vale lo que el cliente escribió.
 */
export function resolveShalomAgency(list: ShalomAgency[], agencyId: string | undefined): { agency: ShalomAgency | null } | { error: string } {
  if (!list.length) return { agency: null };
  if (!agencyId) return { error: "Elige la agencia donde recogerás." };
  const agency = list.find((a) => String(a.id) === agencyId);
  return agency ? { agency } : { error: "Esa agencia ya no está disponible. Elige otra." };
}

// ─── Seguimiento ─────────────────────────────────────────────────────────────


const STEP_LABELS: [ShalomStepKey, string][] = [
  ["registrado", "Registrado en Shalom"],
  ["origen", "En la agencia de origen"],
  ["transito", "En camino"],
  ["destino", "Llegó a la agencia de destino"],
  ["reparto", "En reparto"],
  ["entregado", "Entregado"],
];

/**
 * Solo el estado del envío. La respuesta de Shalom trae nombres y documentos del remitente y del destinatario:
 * no se copian (esto se muestra en la página del pedido).
 */
export function parseTracking(body: unknown): ShalomTracking | null {
  const root = (body ?? {}) as { search?: { success?: boolean; data?: Record<string, unknown> }; statuses?: { data?: Record<string, unknown> } };
  const search = root.search?.data;
  if (!root.search?.success || !search) return null;
  const statuses = root.statuses?.data ?? {};
  const delivered = search.entregado === true;
  const steps = STEP_LABELS.flatMap(([key, label]) => {
    const step = statuses[key] as { fecha?: unknown } | null | undefined;
    if (!step || typeof step.fecha !== "string" || !step.fecha) return [];
    if (key === "entregado" && !delivered) return [];
    return [{ key, label, date: step.fecha }];
  });
  const destination = search.destino as { distrito?: string; departamento?: string } | undefined;
  return {
    delivered,
    destination: destination?.distrito ? [destination.distrito, destination.departamento].filter(Boolean).map((s) => titleCase(String(s))).join(", ") : null,
    eta: typeof search.tiempo_llegada === "string" ? search.tiempo_llegada : null,
    steps,
  };
}
