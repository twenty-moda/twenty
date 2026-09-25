/**
 * Couriers con agencia de destino (Shalom y Olva): tipos y textos que usan el navegador (checkout, pedido) y el
 * servidor (ver server/services/shalom.ts y olva.ts).
 */

export const COURIERS = ["shalom", "olva"] as const;
export type Courier = (typeof COURIERS)[number];
export const COURIER_NAME: Record<Courier, string> = { shalom: "Shalom", olva: "Olva" };

export type CourierAgency = {
  /** Id de la agencia en el courier (Shalom: `ter_id`; Olva: `code`). Sirve también para crear la guía. */
  id: string;
  name: string;
  address: string;
  hours: string | null;
  department: string;
  province: string;
  district: string;
  /** Ubigeo de NUESTRA tabla de distritos (la de la web anterior usa el código de RENIEC; los couriers, el del INEI). */
  ubigeo: string;
  lat: number | null;
  lng: number | null;
};

export type TrackingStep = {
  key: string;
  label: string;
  /** Hora de Lima: "2025-12-23 19:40:00" o solo "2025-12-23". */
  date: string;
  /** Agencia o ciudad del paso (Olva). No va en /tracking. */
  place?: string | null;
};
export type CourierTracking = {
  delivered: boolean;
  /** "Trujillo, La Libertad". */
  destination: string | null;
  /** Listo para mostrar: "Tiempo estimado: 24 horas", "Llegada estimada: 25 ago.". */
  eta: string | null;
  steps: TrackingStep[];
};

/** Guía del courier que anota el equipo. Shalom: N° de orden y código; Olva: N° de tracking y año de emisión. */
export type CourierGuide = { number: string; code: string };

/** Texto que queda en el pedido (y que ve el equipo para despachar). */
export const agencyLabel = (a: Pick<CourierAgency, "name" | "address">) => (a.address && !a.address.startsWith(a.name) ? `${a.name} — ${a.address}` : a.address || a.name);

/** Courier de un método de envío por agencia (por su slug o nombre: "shalom", "Envío Olva"). */
export function methodCourier(method: { kind: string; slug?: string; name: string }): Courier | null {
  if (method.kind !== "agency") return null;
  const text = `${method.slug ?? ""} ${method.name}`;
  return COURIERS.find((c) => new RegExp(c, "i").test(text)) ?? null;
}

/** Courier de un pedido por agencia (tiene seguimiento con la guía). */
export const orderCourier = (order: { shippingKind: string; shippingMethodName: string }) => methodCourier({ kind: order.shippingKind, name: order.shippingMethodName });

/** Cómo se llama cada parte de la guía (panel y email). */
export const GUIDE_FIELDS: Record<Courier, { number: string; numberHint: string; code: string; codeHint: string; codeMaxLength: number }> = {
  shalom: { number: "N° de orden", numberHint: "8 dígitos", code: "Código", codeHint: "Código", codeMaxLength: 4 },
  olva: { number: "N° de tracking", numberHint: "el de la guía", code: "Año de emisión", codeHint: "Año", codeMaxLength: 4 },
};

/** El código como se lee: el año de emisión de Olva va completo ("26" → "2026"). */
export const guideCodeText = (courier: Courier, code: string) => (courier === "olva" && /^\d{2}$/.test(code) ? `20${code}` : code);

const SHALOM_NUMBER = /^\d{8,10}$/;
const SHALOM_CODE = /^[A-Z0-9]{4}$/;
/** El N° de tracking de Olva tiene de 6 a 12 dígitos (así lo pide la API). */
const OLVA_NUMBER = /^\d{6,12}$/;

/** Año en Lima (UTC-5) con 2 dígitos. */
const limaYear = (now: Date) => String(new Date(now.getTime() - 5 * 60 * 60 * 1000).getUTCFullYear()).slice(-2);

/**
 * Valida la guía que escribe el equipo: los dos vacíos = sin guía. En Olva el año de emisión es opcional (sin él,
 * el año en curso) y se guarda con 2 dígitos.
 */
export function parseTrackingInput(
  courier: Courier,
  numberInput: unknown,
  codeInput: unknown,
  now = new Date(),
): { ok: true; tracking: CourierGuide | null } | { ok: false; message: string } {
  const number = String(numberInput ?? "").replace(/[\s-]+/g, "");
  const code = String(codeInput ?? "").trim().toUpperCase();
  if (!number && !code) return { ok: true, tracking: null };
  if (courier === "olva") {
    if (!OLVA_NUMBER.test(number)) return { ok: false, message: "El N° de tracking de Olva tiene de 6 a 12 dígitos (está en la guía del envío)." };
    const year = !code ? limaYear(now) : /^(20)?\d{2}$/.test(code) ? code.slice(-2) : null;
    if (!year) return { ok: false, message: "El año de emisión de Olva es el año de la guía, por ejemplo 2026." };
    return { ok: true, tracking: { number, code: year } };
  }
  if (!SHALOM_NUMBER.test(number)) return { ok: false, message: "El N° de orden de Shalom tiene 8 dígitos (está en la boleta del envío)." };
  if (!SHALOM_CODE.test(code)) return { ok: false, message: "El código de Shalom tiene 4 letras o números (está junto al N° de orden)." };
  return { ok: true, tracking: { number, code } };
}
