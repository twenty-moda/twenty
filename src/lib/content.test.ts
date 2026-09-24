import { describe, expect, it } from "vitest";
import { addBusinessDays, businessDaysLeft, easterSunday, isBusinessDay } from "./business-days";
import { complaintSchema, contactSchema, formatComplaintNumber, trackingSchema } from "./public-forms";
import { excerpt, parseInline, parseRichText, readingMinutes, richTextToPlain } from "./rich-text";

describe("rich text", () => {
  it("convierte títulos, listas, citas y párrafos", () => {
    const blocks = parseRichText("## Envíos\n\nTexto con **negrita** y *cursiva*.\n\n- uno\n- dos\n\n1. paso\n2. otro\n\n> cita\n\n### Sub");
    expect(blocks.map((b) => b.type)).toEqual(["h2", "p", "ul", "ol", "quote", "h3"]);
    expect(blocks[1]).toEqual({
      type: "p",
      children: [
        { type: "text", text: "Texto con " },
        { type: "strong", children: [{ type: "text", text: "negrita" }] },
        { type: "text", text: " y " },
        { type: "em", children: [{ type: "text", text: "cursiva" }] },
        { type: "text", text: "." },
      ],
    });
    expect(blocks[2]).toMatchObject({ type: "ul", items: [[{ type: "text", text: "uno" }], [{ type: "text", text: "dos" }]] });
  });

  it("los enlaces solo pueden ir a http(s), mailto, tel o rutas de la tienda", () => {
    expect(parseInline("[ok](/catalogo)")).toEqual([{ type: "link", href: "/catalogo", children: [{ type: "text", text: "ok" }] }]);
    expect(parseInline("[mal](javascript:alert)")).toEqual([{ type: "text", text: "mal" }]);
    expect(parseInline("<script>x</script>")).toEqual([{ type: "text", text: "<script>x</script>" }]);
  });

  it("no toma guiones bajos dentro de palabras ni asteriscos sueltos como cursiva", () => {
    expect(parseInline("archivo_de_prueba y 5 * 3")).toEqual([{ type: "text", text: "archivo_de_prueba y 5 * 3" }]);
  });

  it("un salto de línea dentro de un párrafo es un <br>", () => {
    expect(parseRichText("línea 1\nlínea 2")[0]).toMatchObject({ children: [{ text: "línea 1" }, { type: "br" }, { text: "línea 2" }] });
  });

  it("resumen, texto plano y minutos de lectura", () => {
    const text = `Primer **párrafo** con [enlace](/x).\n\n${"palabra ".repeat(450)}`;
    expect(richTextToPlain("## Hola\n\n- a\n- b")).toBe("Hola\n\na. b");
    expect(excerpt(text, 200)).toBe("Primer párrafo con enlace.");
    expect(excerpt("Una frase bastante larga que hay que cortar en algún lugar razonable", 40)).toMatch(/…$/);
    expect(readingMinutes(text)).toBe(2);
  });
});

describe("días hábiles (plazo del Libro de Reclamaciones)", () => {
  it("calcula Semana Santa y los feriados", () => {
    expect(easterSunday(2026).toISOString().slice(0, 10)).toBe("2026-04-05");
    expect(isBusinessDay(new Date("2026-04-02T00:00:00Z"))).toBe(false); // Jueves Santo
    expect(isBusinessDay(new Date("2026-04-03T00:00:00Z"))).toBe(false); // Viernes Santo
    expect(isBusinessDay(new Date("2026-07-28T00:00:00Z"))).toBe(false);
    expect(isBusinessDay(new Date("2026-07-27T00:00:00Z"))).toBe(true);
  });

  it("15 días hábiles salta fines de semana y feriados, en hora de Lima", () => {
    // Jueves 24/09/2026 a las 22:00 en Lima (ya es viernes en UTC): el día 1 es el viernes 25.
    const deadline = addBusinessDays(new Date("2026-09-25T03:00:00Z"), 15);
    // 15 días hábiles, con el feriado del jueves 8 de octubre en medio.
    expect(deadline.toISOString().slice(0, 10)).toBe("2026-10-16");
    expect(businessDaysLeft(deadline, new Date("2026-10-14T15:00:00Z"))).toBe(2);
    expect(businessDaysLeft(deadline, new Date("2026-10-16T20:00:00Z"))).toBe(0);
    expect(businessDaysLeft(deadline, new Date("2026-10-20T15:00:00Z"))).toBe(-2);
  });
});

describe("formularios públicos", () => {
  const complaint = {
    type: "reclamo",
    name: "Ana Pérez",
    documentType: "dni",
    documentNumber: "12345678",
    phone: "+51 987 654 321",
    email: "ANA@correo.com",
    ubigeo: "150101",
    address: "Jr. Prueba 123",
    isMinor: false,
    itemType: "producto",
    amount: "S/ 89,90",
    itemDescription: "Baggy jean",
    incidentDate: "2026-09-20",
    detail: "La prenda llegó con una costura rota.",
    request: "Cambio de la prenda",
    accepted: true,
  };

  it("hoja de reclamación válida: normaliza celular, email y monto", () => {
    const parsed = complaintSchema.parse(complaint);
    expect(parsed).toMatchObject({ phone: "987654321", email: "ana@correo.com", amount: 8990, orderNumber: null });
  });

  it("valida el documento, el apoderado de un menor y la declaración", () => {
    const result = complaintSchema.safeParse({ ...complaint, documentNumber: "123", isMinor: true, accepted: false });
    expect(result.success).toBe(false);
    const paths = result.error!.issues.map((i) => i.path[0]);
    expect(paths).toEqual(expect.arrayContaining(["documentNumber", "guardianName", "guardianDocument", "accepted"]));
  });

  it("contacto y rastreo", () => {
    expect(contactSchema.parse({ name: "Luis", email: "l@x.pe", phone: "", message: "Hola, ¿hay talla 30?" }).phone).toBeNull();
    expect(trackingSchema.parse({ number: "#1024", contact: "987654321" }).number).toBe(1024);
    expect(trackingSchema.safeParse({ number: "abc", contact: "987654321" }).success).toBe(false);
  });

  it("número de hoja", () => {
    expect(formatComplaintNumber(7, 2026)).toBe("LR-2026-00007");
  });
});
