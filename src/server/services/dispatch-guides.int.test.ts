import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "../db/client";

// El cliente de BD lee DATABASE_URL: se apunta a la BD de tests antes de importarlo.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
const { getDb, closeDb } = await import("../db/client");
const schema = await import("../db/schema");
const { getOnlineWarehouseId } = await import("./stock");
const { openCashSession, registerSale, sendToSunat } = await import("./pos");
const { createGuide, guessLimaUbigeo, listSaleGuides, sendGuide } = await import("./dispatch-guides");
const { SunatApiError } = await import("./sunat");
type SunatClient = import("./sunat").SunatClient;
type SunatResult = Awaited<ReturnType<SunatClient["emit"]>>;

let db: Db;
let store: string;
let saleId: string;
const ids = { category: randomUUID(), product: randomUUID(), color: randomUUID(), size: randomUUID(), variant: randomUUID() };
const accepted: SunatResult = { status: "aceptado", code: "0", message: "aceptada", hash: "h=", ticketUrl: null, pdfUrl: "https://api/guia.pdf", xmlUrl: null, cdrUrl: null };

function fakeSunat(emit: (payload: Record<string, unknown>) => Promise<SunatResult>) {
  const calls = { emit: [] as Record<string, unknown>[], status: [] as unknown[] };
  const client: SunatClient = {
    emit: async (payload) => {
      calls.emit.push(payload);
      return emit(payload);
    },
    status: async (input) => {
      calls.status.push(input);
      return accepted;
    },
    voidDocument: async () => ({ status: "PENDIENTE", message: null }),
    lookupRuc: async () => null,
  };
  return { client, calls };
}

const guide = (over: Record<string, unknown> = {}) => ({
  saleId,
  transferDate: "2026-11-09",
  recipient: { documentType: "dni" as const, documentNumber: "45678912", name: "Ana Pérez" },
  origin: { ubigeo: "150115", address: "Jr. Antonio Bazo 1288, La Victoria" },
  destination: { ubigeo: "040101", address: "Agencia Shalom Arequipa Centro" },
  transportMode: "01" as const,
  carrier: { ruc: "20123456789", name: "TRANSPORTES DE PRUEBA S.A.C." },
  weightKg: 1.2,
  packages: 1,
  note: null,
  ...over,
});

beforeAll(async () => {
  db = getDb();
  await db.execute(sql`TRUNCATE dispatch_guides, quote_items, quotes, expenses, cash_sessions, document_series, order_status_history, order_items, orders, customers, promotion_products, promotions,
    product_images, product_redirects, product_variants, products, category_fits, categories, fits, colors, sizes RESTART IDENTITY CASCADE`);
  store = await getOnlineWarehouseId(db);
  await db.insert(schema.categories).values({ id: ids.category, slug: "pantalones", name: "Pantalones" });
  await db.insert(schema.colors).values({ id: ids.color, slug: "negro", name: "Negro" });
  await db.insert(schema.sizes).values({ id: ids.size, label: "30" });
  await db.insert(schema.products).values({ id: ids.product, slug: "mom-jean", name: "Mom Jean", categoryId: ids.category, status: "active" });
  await db.insert(schema.productVariants).values({ id: ids.variant, productId: ids.product, sku: "TMW-G1", colorId: ids.color, sizeId: ids.size, priceCents: 9900, stock: 5 });
  await openCashSession(db, { warehouseId: store, openingCents: 0, userId: null });
  const sold = await registerSale(
    db,
    {
      warehouseId: store,
      documentType: "boleta",
      customer: { documentType: "dni", documentNumber: "45678912", name: "Ana Pérez" },
      lines: [{ variantId: ids.variant, quantity: 2 }],
      manualDiscountCents: 0,
      shippingCents: 0,
      payments: [{ method: "yape", amountCents: 19800, receivedCents: null, reference: null }],
      note: null,
    },
    null,
  );
  if (!sold.ok) throw new Error("venta");
  saleId = sold.saleId;
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE dispatch_guides, cash_sessions, document_series, product_variants RESTART IDENTITY CASCADE`);
  await closeDb();
});

describe("guía de remisión", () => {
  it("pide la boleta aceptada y los datos del transporte", async () => {
    expect(await createGuide(db, guide(), null)).toEqual({ ok: false, message: "SUNAT tiene que aceptar primero la boleta o factura." });
    await sendToSunat(db, saleId, fakeSunat(async () => accepted).client);
    expect(await createGuide(db, guide({ carrier: { ruc: "123", name: "X" } }), null)).toMatchObject({ ok: false, message: expect.stringMatching(/RUC de la empresa de transporte/) });
    expect(await createGuide(db, guide({ transportMode: "02", carrier: null }), null)).toMatchObject({ ok: false, message: expect.stringMatching(/placa/) });
    expect(await createGuide(db, guide({ destination: { ubigeo: "999999", address: "Calle 1 123" } }), null)).toMatchObject({ ok: false, message: "Elige el distrito del punto de llegada" });
  });

  it("numera T005, manda la venta como documento relacionado y, si queda pendiente, después consulta el estado", async () => {
    const created = await createGuide(db, guide(), null);
    expect(created).toMatchObject({ ok: true, series: "T005", number: 1 });
    if (!created.ok) return;
    const { client, calls } = fakeSunat(async () => ({ ...accepted, status: "pendiente", message: "En proceso", pdfUrl: null }));
    expect(await sendGuide(db, created.id, client, "20612934020")).toEqual({ status: "pendiente", message: "En proceso" });
    expect(calls.emit[0]).toMatchObject({
      documento: "guia_remision_remitente",
      serie: "T005",
      numero: 1,
      motivo_de_traslado: "01",
      modalidad_de_transporte: "01",
      fecha_entrega_a_transportista: "2026-11-09",
      destinatario_tipo_de_documento: "1",
      destinatario_numero_de_documento: "45678912",
      punto_de_partida_ubigeo: "150115",
      punto_de_llegada_ubigeo: "040101",
      peso_bruto_total: "1.200",
      documentos_relacionados: [{ documento: "boleta", serie: "B005", numero: 1, ruc_emisor: "20612934020" }],
      transportista: { ruc: "20123456789", denominacion: "TRANSPORTES DE PRUEBA S.A.C." },
      items: [{ codigo_interno: "TMW-G1", descripcion: "MOM JEAN NEGRO T30", unidad_de_medida: "NIU", cantidad: "2" }],
    });
    // El reintento no la vuelve a mandar: consulta su estado.
    expect(await sendGuide(db, created.id, client, "20612934020")).toEqual({ status: "aceptado", message: "aceptada" });
    expect([calls.emit.length, calls.status]).toEqual([1, [{ documento: "guia_remision_remitente", serie: "T005", numero: 1 }]]);
    expect((await listSaleGuides(db, saleId))[0]).toMatchObject({ sunatStatus: "aceptado", sunatPdfUrl: "https://api/guia.pdf" });
  });

  it("privado en auto o moto: sin placa ni conductor; si la API ya la tenía de un intento cortado, consulta", async () => {
    const created = await createGuide(db, guide({ transportMode: "02", carrier: null, vehicleM1L: true }), null);
    if (!created.ok) throw new Error(created.message);
    const { client, calls } = fakeSunat(async () => {
      throw new SunatApiError("ERROR: guía de remisión T005-2 fue emitido anteriormente.", 400);
    });
    expect(await sendGuide(db, created.id, client, "20612934020")).toMatchObject({ status: "aceptado" });
    expect(calls.emit[0]).toMatchObject({ modalidad_de_transporte: "02", indicador_vehiculo_m1_l: true, fecha_inicio_de_traslado: "2026-11-09" });
    expect(calls.emit[0]).not.toHaveProperty("transportista");
  });

  it("si la API no acepta los datos, la guía queda rechazada con el motivo", async () => {
    const created = await createGuide(db, guide(), null);
    if (!created.ok) throw new Error(created.message);
    const { client } = fakeSunat(async () => {
      throw new SunatApiError("transportista.ruc no es un RUC válido", 400);
    });
    expect(await sendGuide(db, created.id, client, "20612934020")).toEqual({ status: "rechazado", message: "transportista.ruc no es un RUC válido" });
  });

  it("adivina el distrito de Lima de una dirección", () => {
    expect(guessLimaUbigeo("Jr Antonio Bazo 1288, Gamarra, La victoria, Lima, Perú")).toBe("150115");
    expect(guessLimaUbigeo("Av. Lima 123, San Juan de Miraflores")).toBe("150133");
    expect(guessLimaUbigeo("Calle sin distrito 123")).toBeNull();
  });
});
