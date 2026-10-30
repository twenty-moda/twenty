/**
 * Boletas y facturas de la tienda por la API de Mathyu's Solutions (MATHYU_API_URL + MATHYU_SUNAT_API_KEY: la llave
 * de SUNAT de la cuenta de TWENTY en el portal). La empresa (RUC, certificado y usuario SOL) se configura en la API;
 * mientras esté en beta emite contra el SUNAT de pruebas, sin costo.
 *
 * Cada venta se manda con su número (lo pone nuestra serie) y con `Idempotency-Key` = id de la venta: si se corta la
 * conexión y se reintenta, la API devuelve el mismo comprobante y no emite otro.
 */
import { netLineTotals, type PosDocumentType } from "@/lib/pos";

export type SunatResult = {
  status: "pendiente" | "aceptado" | "rechazado";
  code: string | null;
  message: string | null;
  hash: string | null;
  ticketUrl: string | null;
  pdfUrl: string | null;
  xmlUrl: string | null;
  cdrUrl: string | null;
};

export class SunatApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export type SunatClient = {
  emit(payload: Record<string, unknown>, idempotencyKey: string): Promise<SunatResult>;
  /** Baja de una boleta o factura aceptada (la API arma la comunicación de baja o el resumen diario). */
  voidDocument(input: { documento: "boleta" | "factura"; serie: string; numero: number; motivo: string }): Promise<{ status: string; message: string | null }>;
  /** Razón social y dirección por el RUC (padrón de SUNAT). */
  lookupRuc(ruc: string): Promise<{ name: string; address: string | null } | null>;
};

const ESTADO: Record<string, SunatResult["status"]> = { ACEPTADO: "aceptado", RECHAZADO: "rechazado" };
const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

export function sunatClient(baseUrl: string, apiKey: string, fetchImpl: typeof fetch = fetch): SunatClient {
  const api = baseUrl.replace(/\/+$/, "");
  const call = async (path: string, init: RequestInit & { headers?: Record<string, string> } = {}) => {
    const res = await fetchImpl(`${api}${path}`, {
      ...init,
      headers: { "x-api-key": apiKey, "Content-Type": "application/json", ...init.headers },
      signal: AbortSignal.timeout(45_000),
    });
    const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (res.status !== 200) {
      const message = Array.isArray(body?.message) ? (body.message as unknown[]).join(" ") : text(body?.message);
      throw new SunatApiError(message ?? `La API de SUNAT respondió ${res.status}`, res.status);
    }
    return body ?? {};
  };
  return {
    async emit(payload, idempotencyKey) {
      const body = await call("/sunat/documents", { method: "POST", body: JSON.stringify(payload), headers: { "Idempotency-Key": idempotencyKey } });
      const p = (body.payload ?? {}) as Record<string, unknown>;
      const sunat = (p.sunat ?? {}) as Record<string, unknown>;
      const pdf = (p.pdf ?? {}) as Record<string, unknown>;
      return {
        status: ESTADO[String(p.estado)] ?? "pendiente",
        code: text(sunat.codigo),
        message: text(sunat.descripcion) ?? text(body.message),
        hash: text(p.hash),
        ticketUrl: text(pdf.ticket),
        pdfUrl: text(pdf.a4),
        xmlUrl: text(p.xml),
        cdrUrl: text(p.cdr),
      };
    },
    async voidDocument({ documento, serie, numero, motivo }) {
      const body = await call("/sunat/voided", { method: "POST", body: JSON.stringify({ motivo, documento_afectado: { documento, serie, numero } }) });
      const p = (body.payload ?? {}) as Record<string, unknown>;
      return { status: String(p.estado ?? "PENDIENTE"), message: text(body.message) };
    },
    async lookupRuc(ruc) {
      try {
        const body = await call(`/sunat/ruc/${encodeURIComponent(ruc)}`);
        const p = (body.payload ?? body) as Record<string, unknown>;
        const name = text(p.razon_social) ?? text(p.nombre_o_razon_social) ?? text(p.razonSocial);
        return name ? { name, address: text(p.direccion) ?? text(p.direccion_completa) } : null;
      } catch (error) {
        if (error instanceof SunatApiError && (error.status === 404 || error.status === 400)) return null;
        throw error;
      }
    },
  };
}

/** El cliente de la API si están la URL y la llave de SUNAT; si no, las boletas quedan pendientes hasta configurarla. */
export function sunatFromEnv(): SunatClient | null {
  const url = process.env.MATHYU_API_URL;
  const key = process.env.MATHYU_SUNAT_API_KEY;
  return url && key ? sunatClient(url, key) : null;
}

// ─── El comprobante ──────────────────────────────────────────────────────────

export type PayloadSale = {
  documentType: PosDocumentType;
  series: string;
  number: number;
  createdAt: Date;
  customerDocumentType: "dni" | "ce" | "pasaporte" | "ruc" | null;
  customerDocumentNumber: string | null;
  customerName: string | null;
  customerAddress: string | null;
  manualDiscountCents: number;
  shippingCents: number;
  totalCents: number;
  items: { sku: string; productName: string; colorName: string; sizeLabel: string; quantity: number; totalCents: number }[];
};

/** Catálogo 06 de SUNAT. */
const SUNAT_DOCUMENT_TYPE = { dni: "1", ce: "4", pasaporte: "7", ruc: "6" } as const;
const limaDate = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" });

/** Céntimos ÷ cantidad → soles con 10 decimales ("33.3333333333"), sin floats. 3 × 33.3333333333 da S/ 100.00. */
export function unitPrice(cents: number, quantity: number): string {
  // En BigInt: céntimos × 10⁸ = soles con 10 decimales; (2a + b) / 2b redondea la mitad hacia arriba.
  const q = BigInt(quantity);
  const two = BigInt(2);
  const scaled = (BigInt(cents) * BigInt(100_000_000) * two + q) / (two * q);
  const digits = scaled.toString().padStart(11, "0");
  return `${digits.slice(0, -10)}.${digits.slice(-10)}`.replace(/\.?0+$/, "") || "0";
}

/**
 * Lo que va a SUNAT. Precios con IGV (los de la etiqueta) y ya con la promo: la API calcula el IGV de cada prenda
 * por diferencia y el total cuadra exacto con lo cobrado. El descuento de la tienda se reparte entre las prendas
 * (proporcional a lo que cuesta cada una) y el envío va como un servicio.
 */
export function salePayload(sale: PayloadSale): Record<string, unknown> {
  if (sale.documentType === "nota_venta") throw new Error("Una nota de venta no va a SUNAT");
  const net = netLineTotals(
    sale.items.map((i) => i.totalCents),
    sale.manualDiscountCents,
  );
  const items = sale.items.map((item, i) => garment(item, net[i]));
  if (sale.shippingCents > 0) {
    items.push({ unidad_de_medida: "ZZ", codigo_interno: "ENVIO", descripcion: "SERVICIO DE ENVÍO", cantidad: "1", precio_unitario: unitPrice(sale.shippingCents, 1), porcentaje_igv: "18", codigo_tipo_afectacion_igv: "10" });
  }
  return {
    documento: sale.documentType,
    serie: sale.series,
    numero: sale.number,
    fecha_de_emision: limaDate.format(sale.createdAt),
    moneda: "PEN",
    tipo_operacion: "0101",
    ...customerFields(sale),
    items,
    total: (sale.totalCents / 100).toFixed(2),
  };
}

type Garment = { sku: string; productName: string; colorName: string; sizeLabel: string; quantity: number };

/** Una prenda a precio con IGV: `cents` es lo pagado por todas sus unidades. */
function garment(item: Garment, cents: number): Record<string, unknown> {
  return {
    unidad_de_medida: "NIU",
    codigo_interno: item.sku,
    descripcion: `${item.productName} ${item.colorName} T${item.sizeLabel}`.toUpperCase().slice(0, 500),
    cantidad: String(item.quantity),
    precio_unitario: unitPrice(cents, item.quantity),
    porcentaje_igv: "18",
    codigo_tipo_afectacion_igv: "10",
  };
}

/** El cliente de la venta; sin documento, "CLIENTES VARIOS" (lo que admite SUNAT en una boleta). */
function customerFields(sale: Pick<PayloadSale, "customerDocumentType" | "customerDocumentNumber" | "customerName" | "customerAddress">) {
  const identified = !!(sale.customerDocumentType && sale.customerDocumentNumber);
  return {
    cliente_tipo_de_documento: identified ? SUNAT_DOCUMENT_TYPE[sale.customerDocumentType!] : "-",
    cliente_numero_de_documento: identified ? sale.customerDocumentNumber : "-",
    cliente_denominacion: (sale.customerName?.trim() || "CLIENTES VARIOS").toUpperCase(),
    ...(sale.customerAddress ? { cliente_direccion: sale.customerAddress } : {}),
  };
}

export type PayloadReturn = {
  series: string;
  number: number;
  createdAt: Date;
  /** Catálogo 09: 06 devolución total, 07 devolución por ítem. */
  reasonCode: string;
  reason: string;
  refundCents: number;
  sale: Pick<PayloadSale, "series" | "number" | "customerDocumentType" | "customerDocumentNumber" | "customerName" | "customerAddress"> & { documentType: "boleta" | "factura" };
  items: (Garment & { amountCents: number })[];
};

/** Nota de crédito de una devolución: las prendas devueltas a lo que se pagó por ellas, contra la boleta o factura. */
export function creditNotePayload(ret: PayloadReturn): Record<string, unknown> {
  return {
    documento: "nota_credito",
    serie: ret.series,
    numero: ret.number,
    fecha_de_emision: limaDate.format(ret.createdAt),
    moneda: "PEN",
    tipo_operacion: "0101",
    documento_afectado: { documento: ret.sale.documentType, serie: ret.sale.series, numero: ret.sale.number },
    nota_credito_codigo_tipo: ret.reasonCode,
    nota_credito_motivo: ret.reason.slice(0, 250),
    ...customerFields(ret.sale),
    items: ret.items.map((item) => garment(item, item.amountCents)),
    total: (ret.refundCents / 100).toFixed(2),
  };
}
