import { afterEach, describe, expect, it, vi } from "vitest";
import { mathyuClient, mathyuFromEnv, parseTracking, toAgencies } from "./mathyu-api";

const districts: [string, string, string, string][] = [
  ["010101", "Chachapoyas", "Chachapoyas", "Amazonas"],
  ["040101", "Arequipa", "Arequipa", "Arequipa"],
  ["021001", "Huari", "Huari", "Ancash"],
];
const week = (open: string, close: string) => ({
  monday: { open, close },
  tuesday: { open, close },
  wednesday: { open, close },
  thursday: { open, close },
  friday: { open, close },
  saturday: { open, close },
  sunday: { open: null, close: null },
});
/** Agencia como la devuelve GET /v1/{courier}/agencies. */
const agency = (code: string, extra: Record<string, unknown> = {}) => ({
  code,
  name: "CHACHAPOYAS CO DOS DE MAYO",
  department: "AMAZONAS",
  province: "CHACHAPOYAS",
  district: "CHACHAPOYAS",
  address: "JR. DOS DE MAYO CDRA. 15 S/N",
  ubigeo: "010101",
  latitude: -6.2386732901495,
  longitude: -77.868008265336,
  schedule: week("08:00", "20:00"),
  receivesShipments: true,
  ...extra,
});

describe("toAgencies", () => {
  it("Shalom: nombre del lugar, horario por día y nuestro distrito", () => {
    expect(toAgencies("shalom", [agency("3")], districts)).toEqual([
      {
        id: "3",
        name: "Chachapoyas Co Dos de Mayo",
        address: "Jr. Dos de Mayo Cdra. 15 S/n",
        hours: "Lun a sáb 8:00–20:00",
        department: "Amazonas",
        province: "Chachapoyas",
        district: "Chachapoyas",
        ubigeo: "010101",
        lat: -6.23867,
        lng: -77.86801,
      },
    ]);
  });

  it("Olva: el nombre sin la dirección que Olva le pega", () => {
    const [olva] = toAgencies("olva", [agency("579", { name: "TIENDA CHACHAPOYAS - JR. ORTIZ ARRIETA Nº 270 S/N", address: "JR. ORTIZ ARRIETA Nº 270 S/N" })], districts);
    expect(olva).toMatchObject({ id: "579", name: "Chachapoyas", address: "Jr. Ortiz Arrieta Nº 270 S/n" });
  });

  it("deja fuera las que no reciben envíos, las repetidas, sin código o de un departamento desconocido", () => {
    const list = toAgencies(
      "shalom",
      [agency("1", { receivesShipments: false }), agency("2"), agency("2"), agency("", {}), agency("4", { department: "MARTE" }), agency("5", { schedule: null })],
      districts,
    );
    expect(list.map((a) => [a.id, a.hours])).toEqual([
      ["2", "Lun a sáb 8:00–20:00"],
      ["5", null],
    ]);
  });
});

describe("parseTracking", () => {
  it("Shalom: los hitos con su fecha y el tiempo estimado mientras no se entrega", () => {
    const tracking = parseTracking("shalom", {
      status: "AT_DESTINATION",
      delivered: false,
      transitTime: "24 horas",
      destination: null,
      events: [
        { status: "REGISTERED", rawStatus: "registrado", at: "2026-09-24 20:14:33" },
        { status: "IN_TRANSIT", rawStatus: "transito", at: "2026-09-25 05:47:23" },
        { status: "AT_DESTINATION", rawStatus: "destino", at: "2026-09-25 06:38:09" },
      ],
    });
    expect(tracking).toEqual({
      delivered: false,
      destination: null,
      eta: "Tiempo estimado: 24 horas",
      steps: [
        { key: "registrado", label: "Registrado en Shalom", date: "2026-09-24 20:14:33" },
        { key: "transito", label: "En camino", date: "2026-09-25 05:47:23" },
        { key: "destino", label: "Llegó a la agencia de destino", date: "2026-09-25 06:38:09" },
      ],
    });
  });

  it("Olva: un paso por cada cambio de estado, sin los movimientos que la API no reconoce", () => {
    const step = (at: string, status: string, rawStatus: string, location: string) => ({ at, status, rawStatus, location });
    const tracking = parseTracking("olva", {
      status: "DELIVERED",
      delivered: true,
      deliveredAt: "2026-09-23",
      transitTime: null,
      destination: "HUARI",
      events: [
        step("2026-09-17", "REGISTERED", "REGISTRADO", "LIMA"),
        step("2026-09-18", "REGISTERED", "EN VALIJA", "LIMA"),
        step("2026-09-19", "IN_TRANSIT", "DESPACHADO", "LIMA"),
        step("2026-09-19", "UNKNOWN", "ASIGNADO", "HUARI"),
        step("2026-09-19", "IN_TRANSIT", "DESPACHADO", "LIMA"),
        step("2026-09-21", "AT_DESTINATION", "CONFIRMACION EN TIENDA", "HUARI"),
        step("2026-09-23", "UNKNOWN", "ASIGNADO", "HUARI"),
        step("2026-09-23", "DELIVERED", "ENTREGADO", "HUARI"),
      ],
    });
    expect(tracking).toEqual({
      delivered: true,
      destination: "Huari",
      eta: null,
      steps: [
        { key: "0-registered", label: "Registrado en Olva", date: "2026-09-17", place: "Lima" },
        { key: "1-in_transit", label: "En camino", date: "2026-09-19", place: "Lima" },
        { key: "2-at_destination", label: "Listo para recoger en la agencia", date: "2026-09-21", place: "Huari" },
        { key: "3-delivered", label: "Entregado", date: "2026-09-23", place: "Huari" },
      ],
    });
  });

  it("una respuesta sin pasos no es un seguimiento", () => {
    expect(parseTracking("olva", null)).toBeNull();
    expect(parseTracking("shalom", { statusCode: 500 })).toBeNull();
  });
});

describe("cliente", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("cada courier usa su llave (su plan); sin la URL o sin su llave, null", async () => {
    vi.stubEnv("MATHYU_API_URL", "https://api.example.com/v1");
    vi.stubEnv("MATHYU_SHALOM_API_KEY", "mk_shalom");
    vi.stubEnv("MATHYU_OLVA_API_KEY", "");
    const keys: (string | null)[] = [];
    vi.stubGlobal("fetch", async (_url: string, init?: RequestInit) => {
      keys.push(new Headers(init?.headers).get("x-api-key"));
      return new Response("[]", { status: 200 });
    });
    await mathyuFromEnv("shalom")?.listAgencies("shalom");
    vi.unstubAllGlobals();
    expect(keys).toEqual(["mk_shalom"]);
    expect(mathyuFromEnv("olva")).toBeNull();
    vi.stubEnv("MATHYU_API_URL", "");
    expect(mathyuFromEnv("shalom")).toBeNull();
  });

  it("pide /{courier}/track con la llave; 404 = guía no encontrada", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ statusCode: 404, message: "No se encontró la guía" }), { status: 404 });
    }) as typeof fetch;
    const client = mathyuClient("https://api.example.com/v1/", "mk_test", fetchImpl);
    expect(await client.track("olva", "12345678", "26")).toBeNull();
    expect(calls[0].url).toBe("https://api.example.com/v1/olva/track");
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ orderNumber: "12345678", orderCode: "26" });
    expect(new Headers(calls[0].init?.headers).get("x-api-key")).toBe("mk_test");
  });

  it("agencias: la lista tal cual; un error de la API no se confunde con una lista vacía", async () => {
    const ok = (async () => new Response(JSON.stringify([agency("3")]), { status: 200 })) as typeof fetch;
    expect(await mathyuClient("https://api.example.com/v1", "mk_test", ok).listAgencies("shalom")).toHaveLength(1);
    const quota = (async () => new Response(JSON.stringify({ statusCode: 429 }), { status: 429 })) as typeof fetch;
    await expect(mathyuClient("https://api.example.com/v1", "mk_test", quota).listAgencies("shalom")).rejects.toThrow("429");
    await expect(mathyuClient("https://api.example.com/v1", "mk_test", quota).track("shalom", "12345678", "3KTH")).rejects.toThrow("429");
  });
});
