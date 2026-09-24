/** Validaciones de la cuenta de cliente (mis datos y direcciones). Las usan el navegador y el servidor. */
import { z } from "zod";
import { documentError, normalizePhone } from "./checkout-schema";

const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => v || null);

export const profileSchema = z
  .object({
    name: z.string().trim().min(3, "Escribe tu nombre y apellido").max(120),
    phone: z
      .string()
      .transform(normalizePhone)
      .pipe(z.string().regex(/^9\d{8}$/, "Escribe un celular de 9 dígitos que empiece con 9")),
    documentType: z.enum(["dni", "ce", "pasaporte"]),
    documentNumber: z.string().trim().toUpperCase(),
  })
  .superRefine((data, ctx) => {
    const error = documentError(data.documentType, data.documentNumber);
    if (error) ctx.addIssue({ code: "custom", path: ["documentNumber"], message: error });
  });
export type ProfileInput = z.infer<typeof profileSchema>;

export const ADDRESS_KINDS = {
  delivery: { label: "Delivery en Lima", short: "Delivery" },
  agency: { label: "Recojo en agencia (provincia)", short: "Agencia" },
} as const;
export type AddressKind = keyof typeof ADDRESS_KINDS;

export const addressSchema = z
  .object({
    kind: z.enum(["delivery", "agency"]),
    label: z.string().trim().min(1, "Ponle un nombre, por ejemplo Casa").max(40),
    ubigeo: z.string().regex(/^\d{6}$/, "Elige el distrito"),
    address: optional(200),
    reference: optional(200),
    agencyName: optional(160),
    isDefault: z.boolean().default(false),
  })
  .superRefine((data, ctx) => {
    if (data.kind === "delivery" && !data.address) ctx.addIssue({ code: "custom", path: ["address"], message: "Escribe la dirección" });
    if (data.kind === "agency" && !data.agencyName) ctx.addIssue({ code: "custom", path: ["agencyName"], message: "Escribe la agencia donde recoges" });
  });
export type AddressInput = z.infer<typeof addressSchema>;

/** Una línea para mostrar una dirección guardada (cuenta y checkout). */
export function addressSummary(a: { kind: AddressKind; address: string | null; reference: string | null; agencyName: string | null; district: string; department: string }) {
  return a.kind === "delivery" ? `${a.address}, ${a.district}${a.reference ? ` (${a.reference})` : ""}` : `${a.agencyName} · ${a.district}, ${a.department}`;
}

/** Solo rutas internas para volver después de entrar (evita redirigir a otro sitio). */
export function safeReturnPath(value: unknown, fallback = "/cuenta"): string {
  return typeof value === "string" && /^\/(?![/\\])/.test(value) && !value.startsWith("/ingresar") ? value : fallback;
}
