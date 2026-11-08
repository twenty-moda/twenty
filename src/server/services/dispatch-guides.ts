/**
 * Guía de remisión electrónica (remitente) de una boleta o factura de la tienda, para cuando el cliente la pide
 * (pedido de TWENTY, 08/11/2026). Motivo 01 (venta) con la boleta o factura como documento relacionado, por transporte
 * público (agencia o empresa de transporte) o privado (con placa y conductor, o en auto o moto, que no los piden).
 *
 * Va a SUNAT por la API de Mathyu's Solutions (POST /sunat/documents con `documento: guia_remision_remitente`). SUNAT
 * procesa las guías aparte: si queda pendiente, se consulta su estado (POST /sunat/status) en vez de mandarla otra vez.
 */
import { and, asc, desc, eq, isNotNull } from "drizzle-orm";
import { z } from "zod";
import { checkCustomer } from "@/lib/pos";
import { findInei, ineiDistricts } from "@/lib/ubigeo-inei";
import type { Db } from "../db/client";
import { dispatchGuides, documentType, type DispatchGuideItem } from "../db/schema";
import { getPosSale, takeNumber } from "./pos";
import { listSaleReturns } from "./pos-returns";
import { SunatApiError, type SunatClient } from "./sunat";

type Fail = { ok: false; message: string };

const ubigeo = (label: string) =>
  z
    .string()
    .regex(/^\d{6}$/, `Elige el distrito del ${label}`)
    .refine((v) => !!findInei(v), `Elige el distrito del ${label}`);
const text = (min: number, max: number, message: string) => z.string().trim().min(min, message).max(max);

export const guideInputSchema = z
  .object({
    saleId: z.uuid(),
    transferDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Revisa la fecha de traslado"),
    recipient: z.object({
      documentType: z.enum(documentType.enumValues),
      documentNumber: text(6, 20, "Falta el documento del destinatario"),
      name: text(2, 200, "Falta el nombre del destinatario"),
    }),
    origin: z.object({ ubigeo: ubigeo("punto de partida"), address: text(5, 200, "Escribe la dirección del punto de partida") }),
    destination: z.object({ ubigeo: ubigeo("punto de llegada"), address: text(5, 200, "Escribe la dirección del punto de llegada") }),
    transportMode: z.enum(["01", "02"]),
    carrier: z.object({ ruc: z.string().trim(), name: z.string().trim().max(200) }).nullish(),
    vehicleM1L: z.boolean().default(false),
    vehiclePlate: z.string().trim().toUpperCase().max(10).nullish(),
    driver: z.object({ documentNumber: z.string().trim(), firstName: z.string().trim().max(120), lastName: z.string().trim().max(120), license: z.string().trim().toUpperCase().max(10) }).nullish(),
    weightKg: z.number("Escribe el peso").positive("El peso debe ser mayor que 0").max(100_000),
    packages: z.number().int().min(1, "Al menos 1 bulto").max(9999),
    note: z
      .string()
      .trim()
      .max(250)
      .nullish()
      .transform((v) => v || null),
  })
  .superRefine((d, ctx) => {
    const issue = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message });
    if (d.transportMode === "01") {
      if (!/^(10|20)\d{9}$/.test(d.carrier?.ruc ?? "")) issue("carrier", "Escribe el RUC de la empresa de transporte (11 dígitos).");
      else if ((d.carrier?.name ?? "").length < 2) issue("carrier", "Escribe la razón social de la empresa de transporte.");
    } else if (!d.vehicleM1L) {
      if (!/^[A-Z0-9-]{6,8}$/.test(d.vehiclePlate ?? "")) issue("vehiclePlate", "Escribe la placa del vehículo (6 a 8 letras y números).");
      if (!/^\d{8}$/.test(d.driver?.documentNumber ?? "")) issue("driver", "Escribe el DNI del conductor (8 dígitos).");
      else if (!d.driver?.firstName || !d.driver.lastName) issue("driver", "Escribe los nombres y apellidos del conductor.");
      else if (!/^[A-Z0-9]{9,10}$/.test(d.driver.license)) issue("driver", "La licencia de conducir tiene 9 o 10 letras y números.");
    }
  });
export type GuideInput = z.input<typeof guideInputSchema>;

/** Las prendas que todavía son del cliente: lo vendido menos lo devuelto. */
async function guideItems(db: Db, saleId: string, items: { id: string; sku: string; productName: string; colorName: string; sizeLabel: string; quantity: number }[]): Promise<DispatchGuideItem[]> {
  const returned = (await listSaleReturns(db, saleId)).flatMap((r) => r.items);
  return items
    .map((i) => ({
      sku: i.sku,
      description: `${i.productName} ${i.colorName} T${i.sizeLabel}`.toUpperCase().slice(0, 250),
      quantity: i.quantity - returned.filter((r) => r.saleItemId === i.id).reduce((s, r) => s + r.quantity, 0),
    }))
    .filter((i) => i.quantity > 0);
}

/** Guarda la guía con su número (serie T005 de la tienda). Se manda a SUNAT después (`sendGuide`). */
export async function createGuide(db: Db, raw: GuideInput, userId: string | null): Promise<{ ok: true; id: string; series: string; number: number } | Fail> {
  const parsed = guideInputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const input = parsed.data;
  const problem = checkCustomer("nota_venta", 0, { documentType: input.recipient.documentType, documentNumber: input.recipient.documentNumber, name: input.recipient.name });
  if (problem) return { ok: false, message: problem };
  const sale = await getPosSale(db, input.saleId);
  if (!sale || (sale.documentType !== "boleta" && sale.documentType !== "factura")) return { ok: false, message: "La guía de remisión se hace de una boleta o una factura." };
  if (sale.status !== "pagada") return { ok: false, message: "La venta está anulada." };
  if (sale.sunatStatus !== "aceptado") return { ok: false, message: "SUNAT tiene que aceptar primero la boleta o factura." };
  const items = await guideItems(db, sale.id, sale.items);
  if (!items.length) return { ok: false, message: "Ya se devolvieron todas las prendas de esta venta." };

  return db.transaction(async (tx) => {
    const { series, number } = await takeNumber(tx, sale.warehouseId, "guia_remision");
    const [guide] = await tx
      .insert(dispatchGuides)
      .values({
        series,
        number,
        warehouseId: sale.warehouseId,
        saleId: sale.id,
        transportMode: input.transportMode,
        transferDate: input.transferDate,
        carrierRuc: input.transportMode === "01" ? input.carrier!.ruc : null,
        carrierName: input.transportMode === "01" ? input.carrier!.name : null,
        vehicleM1L: input.transportMode === "02" && input.vehicleM1L,
        vehiclePlate: input.transportMode === "02" && !input.vehicleM1L ? input.vehiclePlate!.replace(/-/g, "") : null,
        driverDocumentNumber: input.transportMode === "02" && !input.vehicleM1L ? input.driver!.documentNumber : null,
        driverFirstName: input.transportMode === "02" && !input.vehicleM1L ? input.driver!.firstName : null,
        driverLastName: input.transportMode === "02" && !input.vehicleM1L ? input.driver!.lastName : null,
        driverLicense: input.transportMode === "02" && !input.vehicleM1L ? input.driver!.license : null,
        recipientDocumentType: input.recipient.documentType,
        recipientDocumentNumber: input.recipient.documentNumber,
        recipientName: input.recipient.name,
        originUbigeo: input.origin.ubigeo,
        originAddress: input.origin.address,
        destinationUbigeo: input.destination.ubigeo,
        destinationAddress: input.destination.address,
        weightGrams: Math.round(input.weightKg * 1000),
        packages: input.packages,
        note: input.note,
        items,
        userId,
      })
      .returning({ id: dispatchGuides.id });
    return { ok: true as const, id: guide.id, series, number };
  });
}

/** Catálogo 06 de SUNAT. */
const SUNAT_DOCUMENT_TYPE = { dni: "1", ce: "4", pasaporte: "7", ruc: "6" } as const;
const limaDate = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" });
type Guide = typeof dispatchGuides.$inferSelect;

/** Lo que va a la API (los campos de apisunat.pe). `ruc`: el de TWENTY, emisor de la boleta o factura relacionada. */
export function guidePayload(guide: Guide, sale: { documentType: "boleta" | "factura"; series: string; number: number }, ruc: string): Record<string, unknown> {
  const privateTransport = guide.transportMode === "02";
  return {
    documento: "guia_remision_remitente",
    serie: guide.series,
    numero: guide.number,
    fecha_de_emision: limaDate.format(guide.createdAt),
    motivo_de_traslado: guide.reasonCode,
    modalidad_de_transporte: guide.transportMode,
    ...(privateTransport ? { fecha_inicio_de_traslado: guide.transferDate } : { fecha_entrega_a_transportista: guide.transferDate, fecha_inicio_de_traslado: guide.transferDate }),
    destinatario_tipo_de_documento: SUNAT_DOCUMENT_TYPE[guide.recipientDocumentType],
    destinatario_numero_de_documento: guide.recipientDocumentNumber,
    destinatario_denominacion: guide.recipientName.toUpperCase(),
    punto_de_partida_ubigeo: guide.originUbigeo,
    punto_de_partida_direccion: guide.originAddress,
    punto_de_llegada_ubigeo: guide.destinationUbigeo,
    punto_de_llegada_direccion: guide.destinationAddress,
    peso_bruto_total: (guide.weightGrams / 1000).toFixed(3),
    peso_bruto_unidad_de_medida: "KGM",
    numero_de_bultos: guide.packages,
    ...(guide.note ? { observaciones: guide.note } : {}),
    documentos_relacionados: [{ documento: sale.documentType, serie: sale.series, numero: sale.number, ruc_emisor: ruc }],
    ...(privateTransport
      ? guide.vehicleM1L
        ? { indicador_vehiculo_m1_l: true }
        : {
            vehiculos: [{ vehiculo: "principal", numero_de_placa: guide.vehiclePlate }],
            conductores: [
              {
                conductor: "principal",
                tipo_de_documento: "1",
                numero_de_documento: guide.driverDocumentNumber,
                nombres: guide.driverFirstName,
                apellidos: guide.driverLastName,
                numero_licencia_conducir: guide.driverLicense,
              },
            ],
          }
      : { transportista: { ruc: guide.carrierRuc, denominacion: guide.carrierName } }),
    items: guide.items.map((i) => ({ codigo_interno: i.sku, descripcion: i.description, unidad_de_medida: "NIU", cantidad: String(i.quantity) })),
  };
}

export type GuideSendResult = { status: "pendiente" | "aceptado" | "rechazado"; message: string | null };

/**
 * Manda la guía a SUNAT o, si la API ya la tiene, consulta su estado. Si no hay respuesta, queda pendiente con el
 * motivo y se reintenta desde la venta.
 */
export async function sendGuide(db: Db, guideId: string, client: SunatClient | null, ruc: string): Promise<GuideSendResult> {
  const [guide] = await db.select().from(dispatchGuides).where(eq(dispatchGuides.id, guideId)).limit(1);
  if (!guide) throw new Error("Esa guía no existe");
  if (guide.sunatStatus === "aceptado") return { status: "aceptado", message: guide.sunatMessage };
  if (!client) {
    const message = "Falta conectar la API de SUNAT (MATHYU_SUNAT_API_KEY): la guía queda pendiente.";
    await db.update(dispatchGuides).set({ sunatMessage: message }).where(eq(dispatchGuides.id, guide.id));
    return { status: "pendiente", message };
  }
  const sale = guide.saleId ? await getPosSale(db, guide.saleId) : null;
  if (!sale || (sale.documentType !== "boleta" && sale.documentType !== "factura")) throw new Error("La guía no tiene su boleta o factura");
  const lookup = { documento: "guia_remision_remitente", serie: guide.series, numero: guide.number };

  let fields: Partial<Guide>;
  try {
    let result;
    if (guide.sunatSubmitted && client.status) result = await client.status(lookup);
    else {
      try {
        result = await client.emit(guidePayload(guide, { ...sale, documentType: sale.documentType }, ruc), guide.id);
      } catch (error) {
        // La API ya la recibió en un intento que se cortó: se consulta en vez de mandarla otra vez.
        if (!(error instanceof SunatApiError && /emitid[oa] anteriormente/i.test(error.message) && client.status)) throw error;
        result = await client.status(lookup);
      }
    }
    fields = {
      sunatSubmitted: true,
      sunatStatus: result.status,
      sunatCode: result.code,
      sunatMessage: result.message,
      sunatPdfUrl: result.pdfUrl,
      sunatXmlUrl: result.xmlUrl,
      sunatCdrUrl: result.cdrUrl,
      sunatSentAt: new Date(),
    };
  } catch (error) {
    // Datos que la API no acepta (400): la guía no se registró y se rechaza con el motivo; sin respuesta, queda pendiente.
    if (error instanceof SunatApiError && error.status >= 400 && error.status < 500) fields = { sunatStatus: "rechazado", sunatMessage: error.message, sunatSentAt: new Date() };
    else {
      console.warn("[sunat] sin respuesta al emitir la guía", `${guide.series}-${guide.number}`, error instanceof Error ? error.message : error);
      fields = { sunatMessage: "No hubo respuesta de SUNAT: se puede reintentar.", sunatSentAt: new Date() };
    }
  }
  await db.update(dispatchGuides).set(fields).where(eq(dispatchGuides.id, guide.id));
  return { status: fields.sunatStatus ?? guide.sunatStatus, message: fields.sunatMessage ?? null };
}

export async function listSaleGuides(db: Db, saleId: string) {
  return db.select().from(dispatchGuides).where(eq(dispatchGuides.saleId, saleId)).orderBy(asc(dispatchGuides.createdAt));
}
export type SaleGuide = Awaited<ReturnType<typeof listSaleGuides>>[number];

/** Para proponer en una guía nueva lo de la última de esa tienda: el punto de partida y la empresa de transporte. */
export async function lastGuideDefaults(db: Db, warehouseId: string) {
  const [last] = await db
    .select({ originUbigeo: dispatchGuides.originUbigeo, originAddress: dispatchGuides.originAddress })
    .from(dispatchGuides)
    .where(eq(dispatchGuides.warehouseId, warehouseId))
    .orderBy(desc(dispatchGuides.createdAt))
    .limit(1);
  const [carrier] = await db
    .select({ ruc: dispatchGuides.carrierRuc, name: dispatchGuides.carrierName })
    .from(dispatchGuides)
    .where(and(eq(dispatchGuides.warehouseId, warehouseId), isNotNull(dispatchGuides.carrierRuc)))
    .orderBy(desc(dispatchGuides.createdAt))
    .limit(1);
  return { origin: last ?? null, carrier: carrier?.ruc ? { ruc: carrier.ruc, name: carrier.name ?? "" } : null };
}

const plain = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toUpperCase();

/** El distrito de Lima o Callao que aparece en una dirección ("Jr. Antonio Bazo 1288, La Victoria" → 150115); si no, null. */
export function guessLimaUbigeo(address: string | null | undefined): string | null {
  if (!address) return null;
  const text = plain(address);
  const found = ineiDistricts()
    .filter((d) => d.ubigeo.startsWith("1501") || d.ubigeo.startsWith("0701"))
    .filter((d) => new RegExp(`(^|[^A-Z])${d.district.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^A-Z]|$)`).test(text))
    .sort((a, b) => b.district.length - a.district.length);
  return found[0]?.ubigeo ?? null;
}
