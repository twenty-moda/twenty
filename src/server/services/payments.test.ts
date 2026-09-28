import { describe, expect, it } from "vitest";
import { antifraudDetails } from "./payments";

const order = { customerName: "Luis Prueba", phone: "987654321", address: null, agencyName: null, district: "Lima" };

describe("antifraudDetails", () => {
  it("recorta la agencia de Shalom a 100 caracteres (con 122, Culqi rechazaba el cargo)", () => {
    const agencyName = "Ovalo de la Familia — Urbanización José Carlos Mariategui (ex Unicreto) Mz R 3 Lt 12, al costado del grifo Primax";
    const details = antifraudDetails({ ...order, agencyName, district: "Nuevo Chimbote" });
    expect(details.address.startsWith("Agencia Ovalo de la Familia")).toBe(true);
    expect(Array.from(details.address).length).toBeLessThanOrEqual(100);
  });

  it("deja cada campo dentro del largo que pide Culqi", () => {
    const details = antifraudDetails(
      {
        customerName: "  María   del Carmen Fernández de la Torre Villanueva y Santisteban Ríos ",
        phone: "+51 987 654 321",
        address: "Av. ".repeat(60),
        agencyName: null,
        district: "San Francisco de Asís de Yarusyacán",
      },
      "device-1",
    );
    expect(details.first_name).toBe("María");
    expect(Array.from(details.last_name).length).toBeLessThanOrEqual(50);
    expect(details.phone_number).toBe("51987654321");
    expect(Array.from(details.address).length).toBeLessThanOrEqual(100);
    expect(details.address_city).toBe("San Francisco de Asís de Yarus");
    expect(details.device_finger_print_id).toBe("device-1");
  });

  it("completa lo que queda muy corto", () => {
    expect(antifraudDetails({ ...order, customerName: "J Pérez", agencyName: "Ica", district: null })).toMatchObject({
      first_name: "Cliente",
      last_name: "Pérez",
      address: "Agencia Ica",
      address_city: "Lima",
    });
    expect(antifraudDetails({ ...order, customerName: "Ana" })).toMatchObject({ first_name: "Ana", last_name: "Ana", address: "Recojo en tienda" });
  });
});
