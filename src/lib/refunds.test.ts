import { describe, expect, it } from "vitest";
import { parseSoles, refundableAmounts, soldOutUnits, suggestSoldOutRefund } from "./refunds";

describe("refundableAmounts", () => {
  const base = { status: "pagado" as const, totalCents: 12000, statuses: [] };

  it("con Culqi: lo pagado es el cargo y se descuenta lo ya devuelto", () => {
    const payments = [{ id: "p1", amountCents: 12000, method: "tarjeta" }];
    expect(refundableAmounts({ ...base, payments, refunds: [] })).toEqual({
      paidCents: 12000,
      refundedCents: 0,
      availableCents: 12000,
      culqi: { paymentId: "p1", maxCents: 12000, method: "tarjeta" },
    });
    // Una devolución registrada a mano también baja lo que Culqi puede devolver.
    const after = refundableAmounts({ ...base, payments, refunds: [{ paymentId: "p1", amountCents: 5000 }, { paymentId: null, amountCents: 2000 }] });
    expect(after).toMatchObject({ refundedCents: 7000, availableCents: 5000, culqi: { maxCents: 5000 } });
    expect(refundableAmounts({ ...base, payments, refunds: [{ paymentId: "p1", amountCents: 12000 }] })).toMatchObject({ availableCents: 0, culqi: null });
  });

  it("sin Culqi (Yape/Plin con QR): el total si el equipo confirmó el pago, aunque después se anulara", () => {
    expect(refundableAmounts({ ...base, payments: [], refunds: [] })).toMatchObject({ paidCents: 12000, availableCents: 12000, culqi: null });
    expect(refundableAmounts({ ...base, status: "anulado", statuses: ["pendiente", "pagado", "anulado"], payments: [], refunds: [] }).availableCents).toBe(12000);
    expect(refundableAmounts({ ...base, status: "anulado", statuses: ["pendiente", "anulado"], payments: [], refunds: [] }).paidCents).toBe(0);
    expect(refundableAmounts({ ...base, status: "por_verificar", payments: [], refunds: [] }).paidCents).toBe(0);
  });
});

describe("suggestSoldOutRefund", () => {
  const items = [
    { id: "a", quantity: 2, totalCents: 10000, available: 2 }, // 2 x S/ 50 con la promo 2 x 100
    { id: "b", quantity: 1, totalCents: 6000, available: 1 },
  ];

  it("lo que se pagó por cada prenda agotada, con su parte de la promo", () => {
    expect(suggestSoldOutRefund(items, { a: 1 }, 1000)).toBe(5000);
    expect(suggestSoldOutRefund(items, { a: 1, b: 1 }, 1000)).toBe(11000);
  });

  it("si ya no queda nada por enviar, también el envío", () => {
    expect(suggestSoldOutRefund(items, { a: 2, b: 1 }, 1000)).toBe(17000);
    expect(suggestSoldOutRefund(items, {}, 1000)).toBe(0);
  });
});

describe("soldOutUnits y parseSoles", () => {
  it("suma las unidades agotadas de todas las devoluciones", () => {
    const units = soldOutUnits([{ items: [{ orderItemId: "a", quantity: 1 }] }, { items: [{ orderItemId: "a", quantity: 1 }, { orderItemId: "b", quantity: 1 }] }]);
    expect(Object.fromEntries(units)).toEqual({ a: 2, b: 1 });
  });

  it("lee montos en soles como los escribe el equipo", () => {
    expect(parseSoles("50")).toBe(5000);
    expect(parseSoles("49.90")).toBe(4990);
    expect(parseSoles("S/ 49,9")).toBe(4990);
    expect(parseSoles("1,234.50")).toBeNaN();
    expect(parseSoles("abc")).toBeNaN();
    expect(parseSoles("")).toBeNaN();
  });
});
