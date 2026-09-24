import { describe, expect, it } from "vitest";
import { agencyLabel, isShalomOrder, parseTrackingInput } from "@/lib/shalom";
import { hoursText, parseTracking, resolveShalomAgency, titleCase, toAgencies } from "./shalom";

const districts: [string, string, string, string][] = [
  ["040101", "Arequipa", "Arequipa", "Arequipa"],
  ["040103", "Cayma", "Arequipa", "Arequipa"],
  ["140103", "Ate", "Lima", "Lima"],
  ["140401", "San Vicente De Cañete", "Cañete", "Lima"],
  ["230201", "Zorritos", "Contralmirante Villar", "Tumbes"],
  ["190115", "Veintiseis De Octubre", "Piura", "Piura"],
];
const raw = (nombre: string, extra: Record<string, unknown> = {}) => ({
  ter_id: 7,
  nombre,
  lugar_over: nombre.split("/").at(-1)?.trim(),
  direccion: "AV. PARRA 379 - AREQUIPA",
  hora_atencion: "LUNES A VIERNES - 7:00 AM A 8:00 PM",
  latitud: "-16.41",
  longitud: "-71.54",
  destino: 1,
  ...extra,
});

describe("toAgencies", () => {
  it("vincula cada agencia con nuestro distrito por nombre, aunque Shalom lo abrevie", () => {
    const list = toAgencies(
      [
        raw("AREQUIPA / AREQUIPA / AREQUIPA / AV PARRA 379"),
        raw("LIMA / LIMA / ATE-VITARTE / HUAYCAN ENTRADA", { ter_id: 8 }),
        raw("LIMA / CAÑETE / SAN VICENTE DE CANET / CAÑETE SAN VICENTE", { ter_id: 9 }),
        raw("TUMBES / CONTRALMIRANTE VILLA / ZORRITOS / ZORRITOS", { ter_id: 10 }),
        raw("PIURA / PIURA / 26 DE OCTUBRE / PIURA FUTURA", { ter_id: 11 }),
        raw("AREQUIPA / AREQUIPA / YANAHUARA / YANAHUARA", { ter_id: 12 }),
      ],
      districts,
    );
    expect(Object.fromEntries(list.map((a) => [a.id, a.ubigeo]))).toEqual({ 7: "040101", 8: "140103", 9: "140401", 10: "230201", 11: "190115", 12: "040101" });
    expect(list.find((a) => a.id === 7)).toMatchObject({ name: "Av Parra 379", address: "Av. Parra 379 - Arequipa", district: "Arequipa", lat: -16.41 });
  });

  it("deja fuera las agencias que no reciben envíos o de un departamento desconocido", () => {
    expect(toAgencies([raw("AREQUIPA / AREQUIPA / AREQUIPA / X", { destino: 0 }), raw("MARTE / X / Y / Z", { ter_id: 3 })], districts)).toEqual([]);
  });
});

describe("parseTracking", () => {
  const body = {
    search: {
      success: true,
      data: {
        entregado: true,
        tiempo_llegada: "24 horas",
        destino: { distrito: "TRUJILLO", departamento: "LA LIBERTAD" },
        remitente: { nombre: "EMPRESA SAC", documento: "20123456789" },
        destinatario: { nombre: "ANA PEREZ", documento: "12345678" },
      },
    },
    statuses: {
      data: {
        registrado: { fecha: "2025-12-20 19:26:39" },
        origen: { fecha: "2025-12-20 19:26:39" },
        transito: { fecha: "2025-12-22 14:26:31" },
        destino: { fecha: "2025-12-23 11:46:13" },
        reparto: null,
        entregado: { fecha: "2025-12-23 19:40:00", cliente: { nombre: "ANA PEREZ", documento: "12345678" } },
      },
    },
  };

  it("devuelve los pasos con fecha y el destino, sin nombres ni documentos", () => {
    const tracking = parseTracking(body);
    expect(tracking).toMatchObject({ delivered: true, destination: "Trujillo, La Libertad", eta: "24 horas" });
    expect(tracking?.steps.map((s) => s.key)).toEqual(["registrado", "origen", "transito", "destino", "entregado"]);
    expect(JSON.stringify(tracking)).not.toMatch(/PEREZ|12345678|20123456789|EMPRESA/i);
  });

  it("sin entregar no muestra el paso de entrega; guía no encontrada = null", () => {
    const pending = parseTracking({ ...body, search: { ...body.search, data: { ...body.search.data, entregado: false } } });
    expect(pending?.steps.at(-1)?.key).toBe("destino");
    expect(parseTracking({ search: { success: false } })).toBeNull();
  });
});

describe("textos", () => {
  it("title case y etiqueta de la agencia", () => {
    expect(titleCase("JR. PRESBÍTERO GARCÍA VILLÓN NRO. 560")).toBe("Jr. Presbítero García Villón Nro. 560");
    expect(titleCase("LUNES A VIERNES DE 8AM")).toBe("Lunes a Viernes de 8am");
    expect(hoursText("LUNES A VIERNES - 7:00 AM A 8:00 PM")).toBe("Lunes a viernes - 7:00 AM a 8:00 PM");
    expect(hoursText("LUNES A SABADO 8AM A 7PM")).toBe("Lunes a sabado 8AM a 7PM");
    expect(agencyLabel({ name: "Av Parra 379", address: "Av. Parra 379 - Arequipa" })).toBe("Av Parra 379 — Av. Parra 379 - Arequipa");
    expect(agencyLabel({ name: "Av. Parra", address: "Av. Parra 379" })).toBe("Av. Parra 379");
  });
});

describe("checkout y seguimiento", () => {
  const [agency] = toAgencies([raw("AREQUIPA / AREQUIPA / CAYMA / CAYMA", { ter_id: 44 })], districts);

  it("la agencia sale de la lista oficial; sin lista vale el texto del cliente", () => {
    expect(resolveShalomAgency([agency], "44")).toEqual({ agency });
    expect(resolveShalomAgency([agency], undefined)).toEqual({ error: "Elige la agencia donde recogerás." });
    expect(resolveShalomAgency([agency], "999")).toMatchObject({ error: expect.stringContaining("ya no está disponible") });
    expect(resolveShalomAgency([], undefined)).toEqual({ agency: null });
    expect(agency).toMatchObject({ ubigeo: "040103", district: "Cayma" });
  });

  it("valida la guía que anota el equipo", () => {
    expect(parseTrackingInput(" 6647 9331 ", "3kth")).toEqual({ ok: true, tracking: { number: "66479331", code: "3KTH" } });
    expect(parseTrackingInput("", "")).toEqual({ ok: true, tracking: null });
    expect(parseTrackingInput("123", "3KTH")).toMatchObject({ ok: false });
    expect(parseTrackingInput("66479331", "3K")).toMatchObject({ ok: false });
  });

  it("reconoce los pedidos que van por Shalom", () => {
    expect(isShalomOrder({ shippingKind: "agency", shippingMethodName: "Envío Shalom" })).toBe(true);
    expect(isShalomOrder({ shippingKind: "agency", shippingMethodName: "Envío Olva" })).toBe(false);
    expect(isShalomOrder({ shippingKind: "lima_delivery", shippingMethodName: "Delivery Lima" })).toBe(false);
  });
});
