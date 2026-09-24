import { describe, expect, it } from "vitest";
import { checkoutSchema } from "./checkout-schema";
import { allowedTransitions, canTransition, ORDER_STATUSES, STATUS_INFO } from "./order-status";
import { priceLines } from "./pricing";
import { parseDistrictName, shippingOptions, type ShippingMethodInfo } from "./shipping";

const promo2x100 = { id: "p2", name: "2 X 100", quantity: 2, bundlePriceCents: 10000 };
const promo4x100 = { id: "p4", name: "POLOS4X100", quantity: 4, bundlePriceCents: 10000 };

describe("priceLines", () => {
  it("sin promo, el total es la suma", () => {
    const r = priceLines([{ variantId: "a", quantity: 2, unitPriceCents: 7000, promotion: null }]);
    expect(r).toMatchObject({ subtotalCents: 14000, discountCents: 0, totalCents: 14000 });
  });

  it("no aplica la promo si no se llega a la cantidad", () => {
    const r = priceLines([{ variantId: "a", quantity: 1, unitPriceCents: 7000, promotion: promo2x100 }]);
    expect(r.totalCents).toBe(7000);
    expect(r.promotions[0]).toMatchObject({ units: 1, discountCents: 0 });
  });

  it("2 x S/ 100 combinando colores y tallas", () => {
    const r = priceLines([
      { variantId: "negro-30", quantity: 1, unitPriceCents: 7000, promotion: promo2x100 },
      { variantId: "plata-32", quantity: 1, unitPriceCents: 7000, promotion: promo2x100 },
    ]);
    expect(r).toMatchObject({ subtotalCents: 14000, discountCents: 4000, totalCents: 10000 });
  });

  it("con 3 prendas, cada una a S/ 50 (regla de la plataforma anterior)", () => {
    const r = priceLines([{ variantId: "a", quantity: 3, unitPriceCents: 7000, promotion: promo2x100 }]);
    expect(r.totalCents).toBe(15000);
  });

  it("promos distintas se cuentan por separado y lo demás va a precio normal", () => {
    const r = priceLines([
      { variantId: "polo", quantity: 4, unitPriceCents: 4000, promotion: promo4x100 },
      { variantId: "jean", quantity: 1, unitPriceCents: 7000, promotion: promo2x100 },
      { variantId: "hoodie", quantity: 1, unitPriceCents: 8500, promotion: null },
    ]);
    expect(r.totalCents).toBe(10000 + 7000 + 8500);
    expect(r.promotions.map((p) => [p.id, p.discountCents])).toEqual([
      ["p4", 6000],
      ["p2", 0],
    ]);
  });

  it("el total cuadra exacto aunque el precio por prenda tenga decimales", () => {
    const promo3x100 = { id: "p3", name: "3 X 100", quantity: 3, bundlePriceCents: 10000 };
    const r = priceLines([
      { variantId: "a", quantity: 2, unitPriceCents: 4000, promotion: promo3x100 },
      { variantId: "b", quantity: 1, unitPriceCents: 4000, promotion: promo3x100 },
    ]);
    expect(r.totalCents).toBe(10000);
    expect(r.lines.map((l) => l.totalCents)).toEqual([6667, 3333]);
    // Con 4 prendas: 4 × 33.33… = 133.33
    expect(priceLines([{ variantId: "a", quantity: 4, unitPriceCents: 4000, promotion: promo3x100 }]).totalCents).toBe(13333);
  });

  it("nunca sube el precio de una prenda que ya cuesta menos que la promo", () => {
    const r = priceLines([
      { variantId: "a", quantity: 1, unitPriceCents: 4000, promotion: promo2x100 },
      { variantId: "b", quantity: 1, unitPriceCents: 7000, promotion: promo2x100 },
    ]);
    expect(r.lines.map((l) => l.discountCents)).toEqual([0, 2000]);
  });
});

describe("estados de pedido", () => {
  it("todos tienen nombre y los finales no permiten cambios", () => {
    for (const s of ORDER_STATUSES) expect(STATUS_INFO[s].label).toBeTruthy();
    expect(allowedTransitions("entregado")).toEqual([]);
    expect(allowedTransitions("anulado")).toEqual([]);
  });

  it("sigue el flujo pendiente → pagado → enviado → entregado", () => {
    expect(canTransition("pendiente", "pagado")).toBe(true);
    expect(canTransition("pagado", "enviado")).toBe(true);
    expect(canTransition("enviado", "entregado")).toBe(true);
    expect(canTransition("pendiente", "entregado")).toBe(false);
    expect(canTransition("entregado", "pendiente")).toBe(false);
  });
});

describe("envíos", () => {
  const methods: ShippingMethodInfo[] = [
    { id: "1", slug: "delivery-lima", name: "Delivery Lima", description: null, details: [], kind: "lima_delivery", paymentOnDelivery: false },
    { id: "2", slug: "shalom", name: "Shalom", description: null, details: [], kind: "agency", paymentOnDelivery: true },
    { id: "3", slug: "recojo", name: "Recojo en tienda", description: null, details: [], kind: "store_pickup", paymentOnDelivery: false },
  ];

  it("en Lima ofrece delivery con su precio, agencia y recojo", () => {
    const surco = { ubigeo: "140130", name: "Santiago De Surco", province: "Lima", department: "Lima", deliveryPriceCents: 1200 };
    expect(shippingOptions(methods, surco).map((o) => [o.slug, o.priceCents])).toEqual([
      ["delivery-lima", 1200],
      ["shalom", 0],
      ["recojo", 0],
    ]);
  });

  it("en provincia no hay delivery Lima; sin distrito solo recojo", () => {
    const arequipa = { ubigeo: "040101", name: "Arequipa", province: "Arequipa", department: "Arequipa", deliveryPriceCents: null };
    expect(shippingOptions(methods, arequipa).map((o) => o.slug)).toEqual(["shalom", "recojo"]);
    expect(shippingOptions(methods, null).map((o) => o.slug)).toEqual(["recojo"]);
  });

  it("separa distrito, provincia y departamento", () => {
    expect(parseDistrictName("Santiago De Surco, Lima - Lima")).toEqual({ name: "Santiago De Surco", province: "Lima", department: "Lima" });
    expect(parseDistrictName("sin formato")).toBeNull();
  });
});

describe("checkoutSchema: formas de pago", () => {
  const input = (paymentMethod: string) => ({
    name: "Ana Pérez",
    phone: "987 654 321",
    email: "ana@example.com",
    documentType: "dni",
    documentNumber: "12345678",
    shippingMethod: "recojo-en-tienda",
    paymentMethod,
    items: [{ variantId: "7b0c1f0e-0000-4000-8000-000000000001", quantity: 1 }],
  });

  it("acepta tarjeta y Yape/Plin; ya no acepta coordinar por WhatsApp", () => {
    expect(checkoutSchema.safeParse(input("tarjeta")).success).toBe(true);
    expect(checkoutSchema.safeParse(input("yape_plin")).success).toBe(true);
    expect(checkoutSchema.safeParse(input("whatsapp")).success).toBe(false);
  });
});
