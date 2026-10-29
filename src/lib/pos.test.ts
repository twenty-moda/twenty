import { describe, expect, it } from "vitest";
import { formatDocNumber, saleTotal, settlePayments } from "./pos";

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

it("formatDocNumber", () => {
  expect(formatDocNumber("NV05", 123)).toBe("NV05-123");
});
