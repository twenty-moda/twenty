import { describe, expect, it } from "vitest";
import { checkCustomer, formatDocNumber, netLineTotals, returnAmount, saleTotal, settlePayments } from "./pos";

describe("saleTotal", () => {
  it("prendas − descuento + envío", () => {
    expect(saleTotal({ itemsTotalCents: 20000, manualDiscountCents: 1000, shippingCents: 1500 })).toEqual({ ok: true, totalCents: 20500 });
  });
  it("no deja descontar más de lo que cuestan las prendas", () => {
    expect(saleTotal({ itemsTotalCents: 5000, manualDiscountCents: 6000, shippingCents: 0 }).ok).toBe(false);
  });
});

describe("settlePayments", () => {
  it("efectivo: el vuelto es lo recibido menos el monto", () => {
    expect(settlePayments(9900, [{ method: "efectivo", amountCents: 9900, receivedCents: 10000, reference: null }])).toEqual({ ok: true, changeCents: 100 });
  });
  it("pago mixto: Yape + efectivo, el vuelto sale solo del efectivo", () => {
    const result = settlePayments(15000, [
      { method: "yape", amountCents: 5000, receivedCents: null, reference: "123456" },
      { method: "efectivo", amountCents: 10000, receivedCents: 20000, reference: null },
    ]);
    expect(result).toEqual({ ok: true, changeCents: 10000 });
  });
  it("los pagos tienen que sumar exacto el total", () => {
    expect(settlePayments(9900, [{ method: "tarjeta", amountCents: 9000, receivedCents: null, reference: null }])).toEqual({
      ok: false,
      message: "Los pagos suman S/ 90 y el total es S/ 99.",
    });
  });
  it("el efectivo recibido no puede ser menos que el monto", () => {
    expect(settlePayments(9900, [{ method: "efectivo", amountCents: 9900, receivedCents: 5000, reference: null }]).ok).toBe(false);
  });
});

describe("checkCustomer", () => {
  const dni = { documentType: "dni" as const, documentNumber: "75413811", name: "Ana Torres" };
  it("factura: RUC y razón social", () => {
    expect(checkCustomer("factura", 10000, dni)).toBe("Para una factura hace falta el RUC y la razón social del cliente.");
    expect(checkCustomer("factura", 10000, { documentType: "ruc", documentNumber: "20612934020", name: "MULTIVENTA PERUANO S.A.C." })).toBeNull();
    expect(checkCustomer("factura", 10000, { documentType: "ruc", documentNumber: "30612934020", name: "X" })).toMatch(/RUC tiene 11 dígitos/);
  });
  it("boleta: sin cliente hasta S/ 699.99; desde S/ 700, documento y nombre", () => {
    expect(checkCustomer("boleta", 69999, null)).toBeNull();
    expect(checkCustomer("boleta", 70000, null)).toBe("Una boleta desde S/ 700 lleva el documento y el nombre del cliente.");
    expect(checkCustomer("boleta", 70000, dni)).toBeNull();
    expect(checkCustomer("boleta", 100, { ...dni, documentNumber: "1234" })).toBe("El DNI tiene 8 dígitos.");
  });
});

describe("devoluciones", () => {
  it("el descuento de la tienda se reparte entre las líneas en proporción", () => {
    expect(netLineTotals([9900, 7000], 1690)).toEqual([8910, 6300]);
    expect(netLineTotals([10000], 0)).toEqual([10000]);
  });
  it("devolver de a una unidad nunca devuelve más de lo pagado: la última se lleva el resto", () => {
    const line = { netCents: 10000, soldQty: 3, returnedQty: 0, returnedCents: 0 };
    const first = returnAmount(line, 1);
    const second = returnAmount({ ...line, returnedQty: 1, returnedCents: first }, 1);
    const third = returnAmount({ ...line, returnedQty: 2, returnedCents: first + second }, 1);
    expect([first, second, third]).toEqual([3333, 3333, 3334]);
    expect(first + second + third).toBe(10000);
  });
});

it("formatDocNumber", () => {
  expect(formatDocNumber("NV05", 123)).toBe("NV05-123");
});
