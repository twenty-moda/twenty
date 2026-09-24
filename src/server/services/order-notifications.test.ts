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
} as unknown as OrderDetail;

const ctx = { settings, baseUrl: "https://tienda.example" };
const brand = emailBrand(settings, ctx.baseUrl);

describe("emails de pedidos", () => {
  const kinds: CustomerEmailKind[] = ["recibido", "por_verificar", "pagado", "en_preparacion", "enviado", "entregado", "anulado", "expirado", "rechazado"];

  it.each(kinds)("%s: asunto con el número, HTML escapado y enlace al pedido", (kind) => {
    const email = customerOrderEmail(kind, order, ctx);
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
    expect(text).toContain("2. Paga exactamente S/ 200.");
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

  it("equipo: pedido nuevo con datos del cliente y enlace al panel, sin el pie para clientes", () => {
    const email = teamOrderEmail("nuevo", order, ctx);
    const { html, text } = renderBrandedEmail(email.content, brand);
    expect(email.subject).toBe("Nuevo pedido #1001 · S/ 200 · Ana <script>alert(1)</script> Pérez");
    expect(text).toContain("https://tienda.example/admin/pedidos/1001");
    expect(text).toContain("TMW-0001 · Negro · Talla M · x2");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("libro-de-reclamaciones");
  });
});
