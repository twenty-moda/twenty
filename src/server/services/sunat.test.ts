import { describe, expect, it } from "vitest";
import { creditNotePayload, salePayload, sunatClient, SunatApiError, unitPrice, type PayloadSale } from "./sunat";

const sale = (over: Partial<PayloadSale> = {}): PayloadSale => ({
  documentType: "boleta",
  series: "B005",
  number: 12,
  createdAt: new Date("2026-10-30T03:30:00Z"), // 29/10 22:30 en Lima
  customerDocumentType: null,
  customerDocumentNumber: null,
  customerName: null,
  customerAddress: null,
  manualDiscountCents: 0,
  shippingCents: 0,
  totalCents: 16900,
  items: [
    { sku: "TMW-0001", productName: "Baggy Ángel", colorName: "Celeste", sizeLabel: "28", quantity: 1, totalCents: 9900 },
    { sku: "TMW-0051", productName: "Flared Jean", colorName: "Total Black", sizeLabel: "32", quantity: 1, totalCents: 7000 },
  ],
  ...over,
});

describe("unitPrice", () => {
  it("céntimos ÷ cantidad con 10 decimales, sin floats", () => {
    expect(unitPrice(9900, 1)).toBe("99");
    expect(unitPrice(5990, 1)).toBe("59.9");
    expect(unitPrice(10000, 3)).toBe("33.3333333333");
    expect(unitPrice(20000, 3)).toBe("66.6666666667");
  });
});

describe("salePayload", () => {
  it("boleta sin cliente: clientes varios, fecha de Lima y precios con IGV", () => {
    const p = salePayload(sale());
    expect(p).toMatchObject({
      documento: "boleta",
      serie: "B005",
      numero: 12,
      fecha_de_emision: "2026-10-29",
      cliente_tipo_de_documento: "-",
      cliente_numero_de_documento: "-",
      cliente_denominacion: "CLIENTES VARIOS",
      total: "169.00",
    });
    expect(p.items).toEqual([
      expect.objectContaining({ codigo_interno: "TMW-0001", descripcion: "BAGGY ÁNGEL CELESTE T28", cantidad: "1", precio_unitario: "99" }),
      expect.objectContaining({ codigo_interno: "TMW-0051", descripcion: "FLARED JEAN TOTAL BLACK T32", cantidad: "1", precio_unitario: "70" }),
    ]);
  });

  it("el descuento de la tienda se reparte entre las prendas y el envío va como servicio", () => {
    const p = salePayload(sale({ manualDiscountCents: 1690, shippingCents: 1000, totalCents: 16210 }));
    const items = p.items as { precio_unitario: string; cantidad: string; descripcion: string }[];
    expect(items.map((i) => i.precio_unitario)).toEqual(["89.1", "63", "10"]);
    expect(items[2].descripcion).toBe("SERVICIO DE ENVÍO");
    const sum = items.reduce((s, i) => s + Number(i.precio_unitario) * Number(i.cantidad), 0);
    expect(sum.toFixed(2)).toBe("162.10");
  });

  it("factura: RUC, razón social y dirección", () => {
    const p = salePayload(sale({ documentType: "factura", series: "F005", customerDocumentType: "ruc", customerDocumentNumber: "20612934020", customerName: "Multiventa Peruano S.A.C.", customerAddress: "Jr. Antonio Bazo 1288" }));
    expect(p).toMatchObject({ documento: "factura", cliente_tipo_de_documento: "6", cliente_numero_de_documento: "20612934020", cliente_denominacion: "MULTIVENTA PERUANO S.A.C.", cliente_direccion: "Jr. Antonio Bazo 1288" });
  });
});

describe("creditNotePayload", () => {
  it("nota de crédito por las prendas devueltas, contra la boleta", () => {
    const p = creditNotePayload({
      series: "BC05",
      number: 1,
      createdAt: new Date("2026-10-30T15:00:00Z"),
      reasonCode: "07",
      reason: "Cambio de talla",
      refundCents: 3333,
      sale: { documentType: "boleta", series: "B005", number: 12, customerDocumentType: null, customerDocumentNumber: null, customerName: null, customerAddress: null },
      items: [{ sku: "TMW-0010", productName: "Polo Oversize", colorName: "Negro", sizeLabel: "M", quantity: 1, amountCents: 3333 }],
    });
    expect(p).toMatchObject({
      documento: "nota_credito",
      serie: "BC05",
      numero: 1,
      documento_afectado: { documento: "boleta", serie: "B005", numero: 12 },
      nota_credito_codigo_tipo: "07",
      nota_credito_motivo: "Cambio de talla",
      cliente_tipo_de_documento: "-",
      total: "33.33",
    });
    expect(p.items).toEqual([expect.objectContaining({ codigo_interno: "TMW-0010", cantidad: "1", precio_unitario: "33.33" })]);
  });
});

describe("sunatClient", () => {
  const respond = (status: number, body: unknown) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

  it("manda la Idempotency-Key y lee el estado y los enlaces", async () => {
    let headers: Headers | undefined;
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      headers = new Headers(init.headers);
      return new Response(
        JSON.stringify({
          success: true,
          message: "El comprobante fue enviado y aceptado por SUNAT.",
          payload: { estado: "ACEPTADO", hash: "abc=", xml: "https://api/x.xml", cdr: "https://api/R-x.xml", pdf: { ticket: "https://api/x-ticket.pdf", a4: "https://api/x.pdf" }, sunat: { codigo: "0", descripcion: "La Boleta numero B005-12, ha sido aceptada" } },
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;
    const result = await sunatClient("https://api/v1", "sk_test", fetchImpl).emit({}, "venta-1");
    expect(headers?.get("idempotency-key")).toBe("venta-1");
    expect(headers?.get("x-api-key")).toBe("sk_test");
    expect(result).toEqual({
      status: "aceptado",
      code: "0",
      message: "La Boleta numero B005-12, ha sido aceptada",
      hash: "abc=",
      ticketUrl: "https://api/x-ticket.pdf",
      pdfUrl: "https://api/x.pdf",
      xmlUrl: "https://api/x.xml",
      cdrUrl: "https://api/R-x.xml",
    });
  });

  it("un error de validación de la API llega con su mensaje", async () => {
    const client = sunatClient("https://api/v1", "k", respond(400, { statusCode: 400, message: "El DNI del cliente debe tener 8 dígitos" }));
    await expect(client.emit({}, "x")).rejects.toEqual(new SunatApiError("El DNI del cliente debe tener 8 dígitos", 400));
  });
});
