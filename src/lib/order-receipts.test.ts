import { describe, expect, it } from "vitest";
import { orderReceiptAmounts, orderReceiptType, type ReceiptOrder } from "./order-receipts";

const item = (id: string, quantity: number, totalCents: number) => ({ id, variantId: `v-${id}`, sku: `TMW-${id}`, productName: "Polo", colorName: "Negro", sizeLabel: "M", quantity, totalCents });
// Dos polos a S/ 50 con la promo, un jean a S/ 50, cupón de S/ 10 y envío de S/ 10: pagó S/ 150.
const order = (refunds: ReceiptOrder["refunds"] = []): ReceiptOrder => ({ items: [item("a", 2, 10000), item("b", 1, 5000)], refunds, shippingCents: 1000, totalCents: 15000 });

describe("orderReceiptAmounts", () => {
  it("sin devoluciones: todas las prendas, el cupón como descuento y el envío; el total es lo pagado", () => {
    const r = orderReceiptAmounts(order());
    expect(r?.items.map((i) => [i.sku, i.quantity, i.totalCents])).toEqual([
      ["TMW-a", 2, 10000],
      ["TMW-b", 1, 5000],
    ]);
    expect(r).toMatchObject({ discountCents: 1000, shippingCents: 1000, totalCents: 15000 });
  });

  it("una prenda agotada y devuelta no va, y el total es lo que no se devolvió", () => {
    const r = orderReceiptAmounts(order([{ amountCents: 4500, items: [{ orderItemId: "a", quantity: 1 }] }]));
    expect(r?.items.map((i) => [i.sku, i.quantity, i.totalCents])).toEqual([
      ["TMW-a", 1, 5000],
      ["TMW-b", 1, 5000],
    ]);
    expect(r).toMatchObject({ discountCents: 500, totalCents: 10500 });
  });

  it("una devolución de dinero sin prendas (cortesía) se suma al descuento", () => {
    expect(orderReceiptAmounts(order([{ amountCents: 2000, items: [] }]))).toMatchObject({ discountCents: 3000, totalCents: 13000 });
  });

  it("si se devolvió todo, no hay comprobante", () => {
    expect(orderReceiptAmounts(order([{ amountCents: 15000, items: [{ orderItemId: "a", quantity: 2 }, { orderItemId: "b", quantity: 1 }] }]))).toBeNull();
    expect(orderReceiptAmounts(order([{ amountCents: 15000, items: [] }]))).toBeNull();
  });
});

describe("orderReceiptType", () => {
  it("manda lo que eligió el equipo; si no, lo del checkout", () => {
    expect(orderReceiptType({ receiptType: null, invoiceType: "factura" })).toBe("factura");
    expect(orderReceiptType({ receiptType: "nota_venta", invoiceType: "boleta" })).toBe("nota_venta");
  });
});
