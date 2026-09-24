/** Validación de los formularios públicos (contacto, boletín, rastreo y Libro de Reclamaciones). */
import { z } from "zod";
import { normalizePhone } from "./checkout-schema";

/** Primer error de cada campo, para mostrarlo debajo del input. */
export function formErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) out[String(issue.path[0] ?? "form")] ??= issue.message;
  return out;
}

const email = z.string().trim().toLowerCase().pipe(z.email("Revisa tu email"));
const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => v || null);

export const contactSchema = z.object({
  name: z.string().trim().min(2, "Escribe tu nombre").max(120),
  email,
  phone: z
    .string()
    .transform(normalizePhone)
    .pipe(z.string().regex(/^(\d{7,15})?$/, "Revisa el número"))
    .transform((v) => v || null),
  message: z.string().trim().min(5, "Escribe tu mensaje").max(3000, "El mensaje es muy largo (máximo 3000 caracteres)"),
});
export type ContactInput = z.infer<typeof contactSchema>;

export const subscribeSchema = z.object({ email });

/** Rastreo: número de pedido + el celular o el email con que se compró (el número solo no basta: es correlativo). */
const orderNumber = z
  .string()
  .trim()
  .transform((v) => v.replace(/^#/, ""))
  .pipe(z.string().regex(/^\d{1,9}$/, "Escribe el número de tu pedido, por ejemplo 1024"))
  .transform(Number);

/** Rastreo: solo el número de pedido. */
export const trackingSchema = z.object({ number: orderNumber });

/** Detalle completo del pedido: el número y el celular o email de la compra. */
export const trackingDetailSchema = z.object({
  number: orderNumber,
  contact: z.string().trim().min(5, "Escribe el celular o el email de tu compra").max(160),
});

const DOCUMENT_RULES = {
  dni: { re: /^\d{8}$/, message: "El DNI tiene 8 dígitos" },
  ce: { re: /^[A-Z0-9]{8,12}$/, message: "Revisa el carné de extranjería" },
  pasaporte: { re: /^[A-Z0-9]{6,12}$/, message: "Revisa el pasaporte" },
  ruc: { re: /^(10|15|17|20)\d{9}$/, message: "El RUC tiene 11 dígitos" },
} as const;

export const complaintSchema = z
  .object({
    type: z.enum(["reclamo", "queja"], { error: "Elige si es un reclamo o una queja" }),
    name: z.string().trim().min(3, "Escribe tu nombre completo").max(160),
    documentType: z.enum(["dni", "ce", "pasaporte", "ruc"]),
    documentNumber: z.string().trim().toUpperCase(),
    phone: z
      .string()
      .transform(normalizePhone)
      .pipe(z.string().regex(/^\d{7,15}$/, "Escribe tu teléfono o celular")),
    email,
    ubigeo: z.string().regex(/^\d{6}$/, "Elige tu distrito"),
    address: z.string().trim().min(5, "Escribe tu dirección").max(200),
    isMinor: z.boolean().default(false),
    guardianName: optional(160),
    guardianDocument: optional(20),
    itemType: z.enum(["producto", "servicio"]),
    amount: z
      .string()
      .transform((v) => v.replace(/s\/\.?/i, "").replace(",", ".").trim())
      .pipe(z.string().regex(/^(\d{1,6}(\.\d{1,2})?)?$/, "Escribe el monto en soles, por ejemplo 89.90"))
      .transform((v) => (v ? Math.round(Number(v) * 100) : null)),
    itemDescription: z.string().trim().min(3, "Describe el producto o servicio").max(300),
    orderNumber: optional(30),
    incidentDate: z
      .string()
      .trim()
      .regex(/^(\d{4}-\d{2}-\d{2})?$/, "Revisa la fecha")
      .transform((v) => v || null),
    detail: z.string().trim().min(10, "Cuéntanos qué pasó (mínimo 10 caracteres)").max(3000),
    request: z.string().trim().min(3, "Cuéntanos qué solución esperas").max(1000),
    accepted: z.literal(true, { error: "Confirma que la información es real" }),
  })
  .superRefine(
    (data, ctx) => {
      const rule = DOCUMENT_RULES[data.documentType];
      if (rule && typeof data.documentNumber === "string" && !rule.re.test(data.documentNumber)) {
        ctx.addIssue({ code: "custom", path: ["documentNumber"], message: rule.message });
      }
      if (data.isMinor && !data.guardianName) ctx.addIssue({ code: "custom", path: ["guardianName"], message: "Escribe el nombre de tu padre, madre o apoderado" });
      if (data.isMinor && !data.guardianDocument) ctx.addIssue({ code: "custom", path: ["guardianDocument"], message: "Escribe su DNI" });
    },
    // Se valida aunque otros campos tengan error: así la persona ve todos los errores de una vez.
    { when: (payload) => typeof payload.value === "object" && payload.value !== null },
  );
export type ComplaintInput = z.infer<typeof complaintSchema>;

export const COMPLAINT_TYPES = {
  reclamo: { label: "Reclamo", help: "Disconformidad con el producto o servicio que compraste." },
  queja: { label: "Queja", help: "Malestar con la atención recibida, no relacionado con el producto." },
} as const;

export const formatComplaintNumber = (n: number, year: number) => `LR-${year}-${String(n).padStart(5, "0")}`;
