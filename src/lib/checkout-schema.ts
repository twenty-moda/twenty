import { z } from "zod";

/** Celular peruano: 9 dígitos que empiezan con 9 (se aceptan espacios y +51). */
export function normalizePhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  return digits.length === 11 && digits.startsWith("51") ? digits.slice(2) : digits;
}

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => v || undefined);

export const checkoutItemSchema = z.object({
  variantId: z.uuid(),
  quantity: z.number().int().min(1).max(10),
});

export const checkoutSchema = z
  .object({
    name: z.string().trim().min(3, "Escribe tu nombre y apellido").max(120),
    phone: z
      .string()
      .transform(normalizePhone)
      .pipe(z.string().regex(/^9\d{8}$/, "Escribe un celular de 9 dígitos que empiece con 9")),
    email: z.string().trim().toLowerCase().pipe(z.email("Revisa tu email")),
    documentType: z.enum(["dni", "ce", "pasaporte"]),
    documentNumber: z.string().trim().toUpperCase(),
    invoiceType: z.enum(["boleta", "factura"]).default("boleta"),
    ruc: optionalText(11),
    businessName: optionalText(160),
    shippingMethod: z.string().min(1, "Elige cómo quieres recibir tu pedido"),
    ubigeo: optionalText(6),
    address: optionalText(200),
    addressReference: optionalText(200),
    agencyName: optionalText(160),
    paymentMethod: z.enum(["tarjeta", "yape_plin", "whatsapp"], { error: "Elige cómo vas a pagar" }),
    note: optionalText(500),
    items: z.array(checkoutItemSchema).min(1, "Tu carrito está vacío").max(30),
  })
  .superRefine((data, ctx) => {
    const doc = data.documentNumber;
    const validDoc =
      data.documentType === "dni" ? /^\d{8}$/.test(doc) : data.documentType === "ce" ? /^[A-Z0-9]{8,12}$/.test(doc) : /^[A-Z0-9]{6,12}$/.test(doc);
    if (!validDoc) {
      ctx.addIssue({
        code: "custom",
        path: ["documentNumber"],
        message: data.documentType === "dni" ? "El DNI tiene 8 dígitos" : "Revisa el número de documento",
      });
    }
    if (data.invoiceType === "factura") {
      if (!data.ruc || !/^(10|15|17|20)\d{9}$/.test(data.ruc)) ctx.addIssue({ code: "custom", path: ["ruc"], message: "El RUC tiene 11 dígitos" });
      if (!data.businessName) ctx.addIssue({ code: "custom", path: ["businessName"], message: "Escribe la razón social" });
    }
  });

export type CheckoutInput = z.infer<typeof checkoutSchema>;
export type CheckoutFieldErrors = Partial<Record<keyof CheckoutInput | "form", string>>;

/** Primer error de cada campo, para mostrarlo debajo del input. */
export function fieldErrors(error: z.ZodError): CheckoutFieldErrors {
  const out: CheckoutFieldErrors = {};
  for (const issue of error.issues) {
    const key = (issue.path[0] as keyof CheckoutInput | undefined) ?? "form";
    out[key] ??= issue.message;
  }
  return out;
}
