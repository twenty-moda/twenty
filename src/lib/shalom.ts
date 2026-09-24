/** Tipos y textos de Shalom que usan el navegador (checkout, pedido) y el servidor (ver server/services/shalom.ts). */

export type ShalomAgency = {
  /** `ter_id` de Shalom: identifica la agencia (sirve también para crear la guía). */
  id: number;
  name: string;
  address: string;
  hours: string | null;
  department: string;
  province: string;
  district: string;
  /** Ubigeo de NUESTRA tabla de distritos (la de la web anterior usa el código de RENIEC; Shalom, el del INEI). */
  ubigeo: string;
  lat: number | null;
  lng: number | null;
};

export type ShalomStepKey = "registrado" | "origen" | "transito" | "destino" | "reparto" | "entregado";
export type ShalomTracking = {
  delivered: boolean;
  /** "Trujillo, La Libertad". */
  destination: string | null;
  /** "24 horas", según Shalom. */
  eta: string | null;
  steps: { key: ShalomStepKey; label: string; date: string }[];
};

/** Texto que queda en el pedido (y que ve el equipo para despachar). */
export const agencyLabel = (a: Pick<ShalomAgency, "name" | "address">) => (a.address && !a.address.startsWith(a.name) ? `${a.name} — ${a.address}` : a.address || a.name);

/** Número de orden (guía) y código de Shalom, como salen en la boleta del envío. */
export const TRACKING_NUMBER = /^\d{8,10}$/;
export const TRACKING_CODE = /^[A-Z0-9]{4}$/;

/** Pedido que va por Shalom (agencia de destino): tiene seguimiento con la guía. */
export const isShalomOrder = (order: { shippingKind: string; shippingMethodName: string }) => order.shippingKind === "agency" && /shalom/i.test(order.shippingMethodName);

/** Valida la guía que escribe el equipo: los dos vacíos = sin guía. */
export function parseTrackingInput(numberInput: unknown, codeInput: unknown): { ok: true; tracking: { number: string; code: string } | null } | { ok: false; message: string } {
  const number = String(numberInput ?? "").replace(/\s+/g, "");
  const code = String(codeInput ?? "").trim().toUpperCase();
  if (!number && !code) return { ok: true, tracking: null };
  if (!TRACKING_NUMBER.test(number)) return { ok: false, message: "El N° de orden de Shalom tiene 8 dígitos (está en la boleta del envío)." };
  if (!TRACKING_CODE.test(code)) return { ok: false, message: "El código de Shalom tiene 4 letras o números (está junto al N° de orden)." };
  return { ok: true, tracking: { number, code } };
}
