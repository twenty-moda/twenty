/**
 * Lo que comparten las APIs de Shalom y Olva: emparejar sus agencias con nuestros distritos, limpiar sus textos y
 * validar la agencia que llega del checkout.
 */
import type { CourierAgency } from "@/lib/couriers";
import { normalizeText } from "@/lib/slug";

export const norm = (value: unknown) =>
  normalizeText(String(value ?? ""))
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Nombres que los couriers usan en lugar del distrito (a veces la ciudad o el pueblo). Solo se prueban si el nombre
 * no existe tal cual en la provincia: "SAN MARCOS" es un distrito en Huari, pero en la provincia San Marcos es Pedro Gálvez.
 */
const DISTRICT_ALIASES: Record<string, string> = {
  "ATE VITARTE": "ATE",
  "CERCADO LIMA": "LIMA",
  "CERCADO DE LIMA": "LIMA",
  CHOSICA: "LURIGANCHO",
  "26 DE OCTUBRE": "VEINTISEIS DE OCTUBRE",
  // Olva
  "SANTA MARIA DE NIEVA": "NIEVA",
  "RODRIGUEZ DE MENDOZA": "SAN NICOLAS",
  "EL PEDREGAL": "MAJES",
  "SAN FRANCISCO": "AYNA",
  TEMBLADERA: "YONAN",
  "SAN MARCOS": "PEDRO GALVEZ",
  QUILLABAMBA: "SANTA ANA",
  "TINGO MARIA": "RUPA RUPA",
  AUCAYACU: "JOSE CRESPO Y CASTILLO",
  "LA MERCED": "CHANCHAMAYO",
  PICHANAKI: "PICHANAQUI",
  CABALLOCOCHA: "RAMON CASTILLA",
  "SAN LORENZO": "BARRANCA",
  "PUERTO MALDONADO": "TAMBOPATA",
  "CERRO DE PASCO": "CHAUPIMARCA",
  ISCOZACIN: "PALCAZU",
  TALARA: "PARINAS",
  ROQUE: "SAN ROQUE DE CUMBAZA",
  NARANJOS: "PARDO MIGUEL",
  PUCALLPA: "CALLERIA",
  ATALAYA: "RAYMONDI",
  AGUAYTIA: "PADRE ABAD",
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

export type DistrictRow = [ubigeo: string, name: string, province: string, department: string];

/**
 * Nuestro distrito para una agencia, por nombre (los códigos no sirven: RENIEC vs. INEI). Shalom corta los nombres
 * a 20 letras y los dos usan algunos nombres propios: se prueba exacto, luego por prefijo y, si no, la capital de la
 * provincia.
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
    // "MAZUCO (INAMBARI)": el nombre y lo que va entre paréntesis; luego el alias o el nombre sin "PUCALLPA"/"BAJO".
    const base = norm(district.replace(/\(.*?\)/g, " "));
    const names = [base, ...[...district.matchAll(/\((.*?)\)/g)].map((m) => norm(m[1])), DISTRICT_ALIASES[base], base.replace(/^(PUCALLPA|BAJO) /, "")].filter(
      (name): name is string => !!name,
    );
    const match =
      names.map((name) => provinceRows.find((d) => d.name === name)).find(Boolean) ??
      names.map((name) => provinceRows.find((d) => samePrefix(d.name, name))).find(Boolean) ??
      provinceRows.find((d) => d.name === provinceRows[0].province) ??
      provinceRows[0];
    return match.ubigeo;
  };
}

/** Coordenadas con 5 decimales (≈1 m): la lista pesa menos. */
export const toCoordinate = (value: unknown) => {
  const n = Number(value);
  return Number.isFinite(n) && n !== 0 ? Math.round(n * 1e5) / 1e5 : null;
};

/** Por departamento, provincia y nombre, como en el resto del checkout. */
export const sortAgencies = (list: CourierAgency[]) =>
  list.sort((x, y) => x.department.localeCompare(y.department, "es") || x.province.localeCompare(y.province, "es") || x.name.localeCompare(y.name, "es"));

/**
 * La agencia de un pedido por Shalom u Olva: la elegida de la lista (su nombre y distrito oficiales, no lo que mande
 * el navegador). Sin lista (el courier no respondió) vale lo que el cliente escribió.
 */
export function resolveAgency(list: CourierAgency[], agencyId: string | undefined): { agency: CourierAgency | null } | { error: string } {
  if (!list.length) return { agency: null };
  if (!agencyId) return { error: "Elige la agencia donde recogerás." };
  const agency = list.find((a) => a.id === agencyId);
  return agency ? { agency } : { error: "Esa agencia ya no está disponible. Elige otra." };
}
