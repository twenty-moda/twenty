import { describe, expect, it } from "vitest";
import { guideCodeText, methodCourier, parseTrackingInput } from "@/lib/couriers";
import { agencyName, limaDate, olvaClient, parseTracking, scheduleText, toAgencies } from "./olva";

const districts: [string, string, string, string][] = [
  ["010101", "Chachapoyas", "Chachapoyas", "Amazonas"],
  ["080901", "Santa Ana", "La Convencion", "Cusco"],
  ["130901", "Pedro Galvez", "San Marcos", "Cajamarca"],
  ["021001", "Huari", "Huari", "Ancash"],
  ["021009", "San Marcos", "Huari", "Ancash"],
  ["170101", "Tambopata", "Tambopata", "Madre De Dios"],
  ["170102", "Inambari", "Tambopata", "Madre De Dios"],
  ["140115", "La Victoria", "Lima", "Lima"],
];
const week = (open: string, close: string, saturday: [string, string] | null = null) => ({
  monday: { open, close },
  tuesday: { open, close },
  wednesday: { open, close },
  thursday: { open, close },
  friday: { open, close },
  saturday: saturday ? { open: saturday[0], close: saturday[1] } : { open: null, close: null },
  sunday: { open: null, close: null },
});
const raw = (code: string, name: string, address: string, department: string, province: string, district: string, extra: Record<string, unknown> = {}) => ({
  code,
  name,
  type: "TIENDAS",
  department,
  province,
  district,
  address,
  ubigeo: "999999",
  partner: "SI",
  phone: null,
  schedule: week("08:00", "19:00", ["08:00", "14:30"]),
  latitude: -6.226970099021466,
  longitude: -77.87291566856221,
  ...extra,
});

describe("toAgencies", () => {
  it("limpia el nombre, arma el horario y vincula nuestro distrito por nombre (no por el ubigeo del INEI)", () => {
    const [agency] = toAgencies([raw("579", "TIENDA CHACHAPOYAS - JR. ORTIZ ARRIETA Nº 270 S/N ", "JR. ORTIZ ARRIETA Nº 270 S/N ", "AMAZONAS", "CHACHAPOYAS", "CHACHAPOYAS")], districts);
    expect(agency).toEqual({
      id: "579",
      name: "Chachapoyas",
      address: "Jr. Ortiz Arrieta Nº 270 S/n",
      hours: "Lun a vie 8:00–19:00 · Sáb 8:00–14:30",
      department: "Amazonas",
      province: "Chachapoyas",
      district: "Chachapoyas",
      ubigeo: "010101",
      lat: -6.22697,
      lng: -77.87292,
    });
  });

  it("usa el distrito aunque Olva escriba la ciudad, sin confundir distritos que sí existen con ese nombre", () => {
    const list = toAgencies(
      [
        raw("1", "TIENDA QUILLABAMBA - JR SAN MARTIN 123", "JR SAN MARTIN 123", "CUSCO", "LA CONVENCION", "QUILLABAMBA"),
        raw("2", "TIENDA SAN MARCOS - JR LEONCIO PRADO 1", "JR LEONCIO PRADO 1", "CAJAMARCA", "SAN MARCOS", "SAN MARCOS"),
        raw("3", "AGENTE OLVA SAN MARCOS - BODEGA", "AV LIMA 5", "ANCASH", "HUARI", "SAN MARCOS"),
        raw("4", "TIENDA MAZUCO - AV INTEROCEANICA", "AV INTEROCEANICA KM 1", "MADRE DE DIOS", "TAMBOPATA", "MAZUCO (INAMBARI)"),
        raw("5", "TIENDA PUERTO MALDONADO - AV 28 DE JULIO NRO 1249", "AV 28 DE JULIO NRO 1249", "MADRE DE DIOS", "TAMBOPATA", "PUERTO MALDONADO"),
      ],
      districts,
    );
    expect(Object.fromEntries(list.map((a) => [a.id, a.district]))).toEqual({ 1: "Santa Ana", 2: "Pedro Galvez", 3: "San Marcos", 4: "Inambari", 5: "Tambopata" });
  });

  it("deja fuera las agencias sin código, repetidas o de un departamento desconocido", () => {
    const ok = raw("9", "OLVA GAMARRA - JR. ANTONIO BAZO 1278 ( LA VICTORIA )", "JR. ANTONIO BAZO 1278 ( LA VICTORIA )", "LIMA", "LIMA", "LA VICTORIA");
    const list = toAgencies([ok, { ...ok }, { ...ok, code: null }, raw("10", "X", "Y", "MARTE", "X", "Y")], districts);
    expect(list.map((a) => [a.id, a.name])).toEqual([["9", "Gamarra"]]);
  });
});

describe("textos de las agencias", () => {
  it("quita la dirección y los prefijos del nombre", () => {
    expect(agencyName("AGENTE OLVA BREÑA - FERNANDINI", "AV. FERNANDINI 1200")).toBe("Agente Breña - Fernandini");
    expect(agencyName("AG. OLVA - CONO NORTE FRANCIS", "CR CARRETERA YURA MZ C")).toBe("Agente Cono Norte Francis");
    expect(agencyName("TRUJILLO - TIENDA ZEPITA - JR ZEPITA NRO 572 TRUJILLO", "JR ZEPITA NRO 572 TRUJILLO")).toBe("Trujillo - Tienda Zepita");
    // Olva corta el nombre a 100 letras: la dirección puede venir a medias.
    expect(agencyName("AGENTE OLVA SAN LUIS - CA POMACANCHI S/N URBANIZACION URB TUPAC AM", "CA POMACANCHI S/N URBANIZACION URB TUPAC AMARU")).toBe("Agente San Luis");
    expect(agencyName("SANTO TOMAS", "JR GRAU 1")).toBe("Santo Tomas");
    expect(agencyName("AGENTE AV ARGENTINA - PAUCARPATA", "AV ARGENTINA 209 PUEBLO JOVEN", "PAUCARPATA")).toBe("Agente Paucarpata");
    // La dirección del nombre escrita distinto que la de la agencia.
    expect(agencyName("OLVA GAMARRA - JR. ANTONIO BAZO 1278 ( LA VICTORIA )", "JR ANTONIO BAZO NRO 1280")).toBe("Gamarra");
    expect(agencyName("WANCHAQ CUSCO - AV PROLONGACION TUPAC AMARU C-5 - WANCHAQ, CUSCO", "AV. TUPAC AMARU C-5")).toBe("Wanchaq Cusco");
  });

  it("junta los días seguidos con el mismo horario", () => {
    expect(scheduleText(week("08:30", "19:00"))).toBe("Lun a vie 8:30–19:00");
    expect(scheduleText({ ...week("09:00", "18:00", ["09:00", "18:00"]), sunday: { open: "10:00", close: "13:00" } })).toBe("Lun a sáb 9:00–18:00 · Dom 10:00–13:00");
    expect(scheduleText({ monday: { open: "08:00", close: "12:00" }, tuesday: { open: "08:00", close: "12:00" }, thursday: { open: "08:00", close: "12:00" } })).toBe(
      "Lun y mar 8:00–12:00 · Jue 8:00–12:00",
    );
    expect(scheduleText(week("", ""))).toBeNull();
    expect(scheduleText(null)).toBeNull();
  });
});

describe("parseTracking", () => {
  const body = {
    success: true,
    data: {
      trackingNumber: "12345678",
      status: "IN_TRANSIT",
      statusDetail: "En tránsito hacia agencia de destino - consignado ANA PEREZ",
      sender: { name: "TWENTY MODA SAC", documentNumber: "20123456789" },
      recipient: { name: "ANA PEREZ", documentNumber: "12345678" },
      origin: { agency: "LIMA - GAMARRA", department: "LIMA" },
      destination: { agency: "AREQUIPA - CERCADO", department: "AREQUIPA" },
      estimatedDelivery: "2026-08-25",
      deliveredAt: null,
      events: [
        { date: "2026-08-19T20:15:00.000Z", status: "IN_TRANSIT", detail: "Salió de LIMA", location: "LIMA - GAMARRA" },
        { date: "2026-08-18 10:05", status: "REGISTERED", detail: "Registrado por ANA PEREZ DNI 12345678", location: "LIMA - GAMARRA" },
        { date: "2026-08-18 10:05", status: "REGISTERED", detail: "Registrado", location: "LIMA - GAMARRA" },
      ],
    },
  };

  it("devuelve los pasos en orden, con fecha de Lima y agencia, sin nombres, documentos ni textos libres", () => {
    const tracking = parseTracking(body);
    expect(tracking).toEqual({
      delivered: false,
      destination: "Arequipa - Cercado",
      eta: "Llegada estimada: 25 ago.",
      steps: [
        { key: "0-registered", label: "Registrado en Olva", date: "2026-08-18 10:05:00", place: "Lima - Gamarra" },
        { key: "1-in_transit", label: "En camino", date: "2026-08-19 15:15:00", place: "Lima - Gamarra" },
      ],
    });
    expect(JSON.stringify(tracking)).not.toMatch(/PEREZ|12345678|20123456789|TWENTY MODA|tránsito/i);
  });

  it("entregado: agrega el paso con la fecha de entrega y ya no muestra la llegada estimada", () => {
    const tracking = parseTracking({ ...body, data: { ...body.data, status: "DELIVERED", deliveredAt: "2026-08-24" } });
    expect(tracking).toMatchObject({ delivered: true, eta: null });
    expect(tracking?.steps.at(-1)).toMatchObject({ label: "Entregado", date: "2026-08-24" });
  });

  it("sin datos o con error = null; estados que la API no reconoce salen como movimiento", () => {
    expect(parseTracking({ success: false })).toBeNull();
    expect(parseTracking(null)).toBeNull();
    const unknown = parseTracking({ success: true, data: { status: "UNKNOWN", events: [{ date: "18/08/2026 09:30", status: "UNKNOWN" }, { date: "sin fecha" }] } });
    expect(unknown?.steps).toEqual([{ key: "0-unknown", label: "Movimiento del envío", date: "2026-08-18 09:30:00", place: null }]);
  });

  it("fechas a la hora de Lima", () => {
    expect(limaDate("2026-01-01T03:00:00Z")).toBe("2025-12-31 22:00:00");
    expect(limaDate("2026-08-18T10:00:00-05:00")).toBe("2026-08-18 10:00:00");
    expect(limaDate("2026-08-18")).toBe("2026-08-18");
    expect(limaDate("mañana")).toBeNull();
  });
});

describe("cliente", () => {
  it("rastrea con el N° de tracking y el año; 404 = guía no encontrada", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ error: "Olva no encontró el recurso solicitado (tracking)", statusCode: 404 }), { status: 404 });
    }) as typeof fetch;
    expect(await olvaClient("olva_test", fetchImpl).track("12345678", "26")).toBeNull();
    expect(calls[0].url).toBe("https://api.olva-api.lat/track");
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ orderNumber: "12345678", orderCode: "26" });
    expect(new Headers(calls[0].init?.headers).get("x-api-key")).toBe("olva_test");
  });

  it("un error de la API no se confunde con una guía sin movimientos", async () => {
    const fetchImpl = (async () => new Response(JSON.stringify({ error: "Límite mensual alcanzado", statusCode: 429 }), { status: 429 })) as typeof fetch;
    await expect(olvaClient("olva_test", fetchImpl).track("12345678", "26")).rejects.toThrow("429");
  });
});

describe("guía y método de envío", () => {
  const now = new Date("2026-01-01T03:00:00Z"); // 31 de diciembre de 2025 en Lima

  it("valida la guía de Olva: el año es opcional (el de Lima) y se guarda con 2 dígitos", () => {
    expect(parseTrackingInput("olva", " 1234-5678 ", "", now)).toEqual({ ok: true, tracking: { number: "12345678", code: "25" } });
    expect(parseTrackingInput("olva", "12345678", "2026", now)).toEqual({ ok: true, tracking: { number: "12345678", code: "26" } });
    expect(parseTrackingInput("olva", "12345678", "26", now)).toEqual({ ok: true, tracking: { number: "12345678", code: "26" } });
    expect(parseTrackingInput("olva", "12345", "26", now)).toMatchObject({ ok: false });
    expect(parseTrackingInput("olva", "12345678", "3KTH", now)).toMatchObject({ ok: false });
    expect(guideCodeText("olva", "26")).toBe("2026");
    expect(guideCodeText("shalom", "3KTH")).toBe("3KTH");
  });

  it("reconoce el courier del método de envío", () => {
    expect(methodCourier({ kind: "agency", slug: "olva", name: "Envío Olva" })).toBe("olva");
    expect(methodCourier({ kind: "agency", slug: "shalom", name: "Envío Shalom" })).toBe("shalom");
    expect(methodCourier({ kind: "lima_delivery", slug: "delivery-lima", name: "Delivery Lima" })).toBeNull();
  });
});
