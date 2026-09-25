import { describe, expect, it } from "vitest";
import type { SiteSettings } from "./content";
import { emailBrand, renderBrandedEmail } from "./email-layout";
import { customerOrderEmail, teamOrderEmail, type CustomerEmailKind } from "./order-emails";
import { planOrderEmails } from "./order-notifications";
import type { OrderDetail, StatusChange } from "./orders";

const change = (over: Partial<StatusChange>): StatusChange => ({
  orderId: "o1",
  historyId: "h1",
  from: "pendiente",
  to: "pagado",
  changedBy: "admin-1",
  restocked: false,
  paymentMethod: "yape_plin",
  ...over,
});
const status = (over: Partial<StatusChange>, notifyCustomer?: boolean) => planOrderEmails({ type: "status", change: change(over), notifyCustomer });

describe("planOrderEmails", () => {
  it("al comprar con Yape/Plin o WhatsApp avisa al cliente y al equipo; con tarjeta espera al pago", () => {
    expect(planOrderEmails({ type: "placed", orderId: "o1", paymentMethod: "yape_plin" })).toEqual({ customer: "recibido", team: "nuevo" });
    expect(planOrderEmails({ type: "placed", orderId: "o1", paymentMethod: "whatsapp" })).toEqual({ customer: "recibido", team: "nuevo" });
    expect(planOrderEmails({ type: "placed", orderId: "o1", paymentMethod: "tarjeta" })).toEqual({ customer: null, team: null });
  });

  it("el pago con Culqi es el pedido nuevo para el equipo; el pago confirmado por un admin solo avisa al cliente", () => {
    expect(status({ paymentMethod: "tarjeta", changedBy: null })).toEqual({ customer: "pagado", team: "nuevo" });
    expect(status({ from: "por_verificar" })).toEqual({ customer: "pagado", team: null });
  });

  it("cada captura de Yape/Plin que sube el cliente le llega al equipo; el paso a por verificar solo al cliente", () => {
    expect(planOrderEmails({ type: "proof", orderId: "o1", proofId: "p1" })).toEqual({ customer: null, team: "comprobante" });
    expect(status({ from: "pendiente", to: "por_verificar", changedBy: null })).toEqual({ customer: "por_verificar", team: null });
    expect(status({ from: "pendiente", to: "por_verificar" })).toEqual({ customer: "por_verificar", team: null });
  });

  it("cada avance le llega al cliente", () => {
    expect(status({ from: "pendiente", to: "por_verificar" }).customer).toBe("por_verificar");
    expect(status({ from: "pagado", to: "en_preparacion" }).customer).toBe("en_preparacion");
    expect(status({ from: "en_preparacion", to: "enviado" }).customer).toBe("enviado");
    expect(status({ from: "pagado", to: "enviado" }).customer).toBe("enviado");
    expect(status({ from: "enviado", to: "entregado" }).customer).toBe("entregado");
  });

  it("los retrocesos (corregir un estado) no se avisan", () => {
    expect(status({ from: "en_preparacion", to: "pagado" })).toEqual({ customer: null, team: null });
    expect(status({ from: "enviado", to: "en_preparacion" })).toEqual({ customer: null, team: null });
    expect(status({ from: "por_verificar", to: "pendiente" })).toEqual({ customer: null, team: null });
  });

  it("anular o rechazar avisa a los dos; la anulación automática de un pago con tarjeta pendiente solo al cliente", () => {
    expect(status({ from: "pagado", to: "anulado" })).toEqual({ customer: "anulado", team: "anulado" });
    expect(status({ from: "por_verificar", to: "rechazado" })).toEqual({ customer: "rechazado", team: "rechazado" });
    expect(status({ from: "pendiente", to: "anulado", changedBy: null, paymentMethod: "tarjeta" })).toEqual({ customer: "expirado", team: null });
  });

  it("si el admin desmarca el aviso, el cliente no recibe email (el equipo sí)", () => {
    expect(status({ from: "pagado", to: "anulado" }, false)).toEqual({ customer: null, team: "anulado" });
  });

  it("cada devolución de dinero le llega al cliente (si no se desmarca) y al equipo", () => {
    expect(planOrderEmails({ type: "refund", orderId: "o1", refundId: "r1", userId: "admin-1" })).toEqual({ customer: "devolucion", team: "devolucion" });
    expect(planOrderEmails({ type: "refund", orderId: "o1", refundId: "r1", userId: "admin-1", notifyCustomer: false })).toEqual({ customer: null, team: "devolucion" });
  });
});

const settings = {
  contact: { whatsapp: "+51 902675269", email: "hola@example.com", phone: "", address: "", openingHours: "10:00 a 20:00", whatsappMessage: "" },
  socials: [{ name: "Instagram", url: "https://instagram.com/example" }],
  company: { legalName: "Empresa S.A.C.", ruc: "20123456789", address: "Jr. Ejemplo 123", notificationEmail: "equipo@example.com" },
  store: { name: "Tienda", address: "Jr. Ejemplo 123, Lima", phone: "", latitude: 0, longitude: 0, hours: [] },
  payments: { culqiEnabled: true, walletEnabled: true, walletName: "QR Empresa", walletDescription: "", walletQr: "/pagos/qr.jpeg" },
} as unknown as SiteSettings;

const order = {
  id: "7b0c1f0e-0000-4000-8000-000000000001",
  number: 1001,
  status: "pendiente",
  customerName: "Ana <script>alert(1)</script> Pérez",
  email: "ana@example.com",
  phone: "987654321",
  documentType: "dni",
  documentNumber: "12345678",
  invoiceType: "boleta",
  ruc: null,
  businessName: null,
  shippingMethodName: "Envío Shalom",
  shippingKind: "agency",
  paymentOnDelivery: true,
  district: "Arequipa",
  department: "Arequipa",
  address: null,
  addressReference: null,
  agencyName: "Shalom Av. Ejército",
  paymentMethod: "yape_plin",
  subtotalCents: 20000,
  discountCents: 0,
  shippingCents: 0,
  totalCents: 20000,
  promotions: [{ id: "p1", name: "2 X 100", quantity: 2, bundlePriceCents: 10000, discountCents: 4000 }],
  customerNote: null,
  items: [{ id: "i1", productName: "Baggy Jean", sku: "TMW-0001", colorName: "Negro", sizeLabel: "M", quantity: 2, totalCents: 20000, image: "item/TMW-0001.webp" }],
  history: [],
  refunds: [],
} as unknown as OrderDetail;

/** Devolución de S/ 100 por Culqi: una de las dos Baggy Jean se agotó. */
const refund = {
  id: "r1",
  paymentId: "pay1",
  method: "culqi",
  status: "hecha",
  providerId: "ref_live_123",
  amountCents: 10000,
  reason: "agotado",
  note: "Se manchó en el almacén",
  customerMessage: "Te enviamos la otra esta semana.",
  createdAt: new Date("2026-09-25T15:00:00Z"),
  createdByName: "Tatiana",
  items: [{ orderItemId: "i1", quantity: 1 }],
} satisfies OrderDetail["refunds"][number];
const refundedOrder = { ...order, status: "pagado", refunds: [refund] } as OrderDetail;

const ctx = { settings, baseUrl: "https://tienda.example" };
const brand = emailBrand(settings, ctx.baseUrl);

describe("emails de pedidos", () => {
  const kinds: CustomerEmailKind[] = ["recibido", "por_verificar", "pagado", "en_preparacion", "enviado", "entregado", "anulado", "expirado", "rechazado", "devolucion"];

  it.each(kinds)("%s: asunto con el número, HTML escapado y enlace al pedido", (kind) => {
    const email = customerOrderEmail(kind, order, ctx, undefined, refund);
    const { html, text } = renderBrandedEmail(email.content, brand);
    expect(email.subject).toContain("#1001");
    expect(html).not.toContain("<script>");
    expect(html).toContain("https://tienda.example/brand/twenty-logo-email.png");
    expect(html).toContain("https://tienda.example/libro-de-reclamaciones");
    if (!["entregado", "anulado", "expirado", "rechazado"].includes(kind)) expect(text).toContain(`https://tienda.example/pedido/${order.id}`);
  });

  it("Yape/Plin: QR con URL absoluta y los pasos para pagar", () => {
    const { html, text } = renderBrandedEmail(customerOrderEmail("recibido", order, ctx).content, brand);
    expect(html).toContain('src="https://tienda.example/pagos/qr.jpeg"');
    // Fotos del bucket en JPEG (el WebP no se ve en Outlook de escritorio), al doble del tamaño que se muestra.
    expect(html).toContain('src="https://tienda.example/api/email-image/item/TMW-0001.webp?w=144"');
    expect(text).toContain("2. Paga exactamente S/ 200.");
    expect(text).toContain("3. Sube la captura del pago en la página de tu pedido.");
    expect(text).toContain("Promo 2 X 100: -S/ 40");
  });

  it("enviado por agencia: dice dónde recoger, con qué documento y el mensaje del equipo", () => {
    const { text } = renderBrandedEmail(customerOrderEmail("enviado", { ...order, trackingNumber: "66479331", trackingCode: "3KTH" } as OrderDetail, ctx, "Clave de recojo: 4321").content, brand);
    expect(text).toContain("Shalom Av. Ejército");
    expect(text).toContain("DNI 12345678");
    expect(text).toContain("El envío se paga al recoger.");
    expect(text).toContain("Clave de recojo: 4321");
    expect(text).toContain("N° de orden: 66479331");
    expect(text).toContain("Código: 3KTH");
  });

  it("devolución por prenda agotada: cuánto, a dónde, qué prenda y que el resto sigue", () => {
    const email = customerOrderEmail("devolucion", refundedOrder, ctx, undefined, refund);
    const { text } = renderBrandedEmail(email.content, brand);
    expect(email.subject).toBe("Te devolvimos S/ 100 · Pedido #1001");
    expect(text).toContain("te devolvimos S/ 100 de tu pedido #1001 a la tarjeta o el Yape con que pagaste.");
    expect(text).toContain("Baggy Jean (Negro, talla M) se agotó y no podremos enviártela. El resto de tu pedido sigue su curso.");
    expect(text).toContain("Te enviamos la otra esta semana.");
    expect(text).toContain("1 agotada (devuelta)");
    expect(text).toContain("Devuelto: -S/ 100");
    // La nota interna nunca va al cliente.
    expect(text).not.toContain("almacén");

    const courtesy = customerOrderEmail("devolucion", refundedOrder, ctx, undefined, { ...refund, reason: "cortesia", method: "manual", items: [] });
    const courtesyText = renderBrandedEmail(courtesy.content, brand).text;
    expect(courtesyText).toContain("te devolvimos S/ 100 de tu pedido #1001. Es una cortesía de TWENTY para ti.");
    expect(courtesyText).not.toContain("tarjeta");
  });

  it("anulado con devolución: dice cuánto se devolvió en vez de «si ya pagaste, escríbenos»", () => {
    const email = customerOrderEmail("anulado", { ...refundedOrder, status: "anulado", refunds: [{ ...refund, amountCents: 20000, items: [] }] } as OrderDetail, ctx);
    const { text } = renderBrandedEmail(email.content, brand);
    expect(email.subject).toBe("Tu pedido #1001 fue anulado: te devolvimos S/ 200");
    expect(text).toContain("anulamos tu pedido #1001 y te devolvimos S/ 200 a la tarjeta o el Yape con que pagaste.");
    expect(text).not.toContain("Si ya pagaste");
  });

  it("equipo: devolución con motivo, prendas agotadas, id de Culqi y quién la hizo", () => {
    const email = teamOrderEmail("devolucion", refundedOrder, ctx, undefined, undefined, refund);
    const { text } = renderBrandedEmail(email.content, brand);
    expect(email.subject).toBe("Devolución de S/ 100 · Pedido #1001 · Ana <script>alert(1)</script> Pérez");
    expect(text).toContain("Motivo: Prenda agotada");
    expect(text).toContain("Agotadas: Baggy Jean (Negro, talla M)");
    expect(text).toContain("Cómo: Culqi · ref_live_123");
    expect(text).toContain("Lo hizo: Tatiana");
    expect(text).toContain("Nota: Se manchó en el almacén");
    expect(text).toContain("https://tienda.example/admin/pedidos/1001");
  });

  it("equipo: pedido nuevo con datos del cliente y enlace al panel, sin el pie para clientes", () => {
    const email = teamOrderEmail("nuevo", order, ctx);
    const { html, text } = renderBrandedEmail(email.content, brand);
    expect(email.subject).toBe("Nuevo pedido #1001 · S/ 200 · Ana <script>alert(1)</script> Pérez");
    expect(text).toContain("https://tienda.example/admin/pedidos/1001");
    expect(text).toContain("TMW-0001 · Negro · Talla M · x2");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("libro-de-reclamaciones");
  });

  it("equipo: captura de pago con la imagen dentro del email y enlace al pedido en el panel", () => {
    const email = teamOrderEmail("comprobante", order, ctx, undefined, { src: "cid:captura-pago", nth: 1 });
    const { html, text } = renderBrandedEmail(email.content, brand);
    expect(email.subject).toContain("Captura de pago · Pedido #1001 · S/ 200");
    expect(html).toContain('src="cid:captura-pago"');
    expect(text).toContain("https://tienda.example/admin/pedidos/1001");
    expect(text).toContain("La captura también va adjunta");

    const again = teamOrderEmail("comprobante", order, ctx, undefined, { src: "cid:captura-pago", nth: 2 });
    expect(again.subject).toContain("Otra captura de pago · Pedido #1001");
    expect(again.content.title).toBe("Nueva captura de pago");
  });
});
