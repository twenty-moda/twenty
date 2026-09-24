import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "../db/client";
import { settings, slides } from "../db/schema";

const contactSchema = z.object({
  whatsapp: z.string().default(""),
  whatsappMessage: z.string().default(""),
  /** Botón flotante de WhatsApp en la tienda (si hay número). */
  whatsappFloat: z.boolean().default(true),
  phone: z.string().default(""),
  email: z.string().default(""),
  address: z.string().default(""),
  openingHours: z.string().default(""),
});

const storeSchema = z
  .object({
    name: z.string(),
    address: z.string(),
    phone: z.string(),
    latitude: z.number(),
    longitude: z.number(),
    hours: z.array(z.object({ day: z.string(), open: z.string(), close: z.string(), closed: z.boolean() })),
  })
  .nullable();

const productInfoSchema = z.object({
  shipping: z.array(z.string()).default([]),
  returns: z.array(z.string()).default([]),
});

const paymentsSchema = z.object({
  /** Tarjeta y Yape con Culqi. Solo se ofrece si además están las llaves en las variables de entorno. */
  culqiEnabled: z.boolean().default(true),
  walletEnabled: z.boolean().default(true),
  walletName: z.string().default(""),
  walletDescription: z.string().default(""),
  walletQr: z.string().default(""),
});

/** Razón social y RUC: van en el Libro de Reclamaciones, los términos y el pie de página. */
const companySchema = z.object({
  legalName: z.string().default(""),
  ruc: z.string().default(""),
  address: z.string().default(""),
  /** Adonde llegan los avisos de reclamos y mensajes de contacto. */
  notificationEmail: z.string().default(""),
});

const aboutSchema = z.object({
  title: z.string().default("Nosotros"),
  body: z.string().default(""),
  image: z.string().nullable().default(null),
  quote: z.string().default(""),
  mission: z.string().default(""),
  vision: z.string().default(""),
  strengthsTitle: z.string().default(""),
  strengths: z.array(z.object({ title: z.string(), description: z.string(), icon: z.string().nullable() })).default([]),
});

const faqSchema = z.object({ question: z.string().trim().min(3), answer: z.string().trim().min(1) });

const legalPageSchema = z.object({ body: z.string().default(""), updatedAt: z.string().nullable().default(null) });
const legalSchema = z.object({
  terms: legalPageSchema.default(legalPageSchema.parse({})),
  privacy: legalPageSchema.default(legalPageSchema.parse({})),
  shipping: legalPageSchema.default(legalPageSchema.parse({})),
  returns: legalPageSchema.default(legalPageSchema.parse({})),
});
export type LegalKey = keyof z.infer<typeof legalSchema>;

const siteSettingsSchema = z.object({
  announcements: z.array(z.string()).default([]),
  contact: contactSchema.default(contactSchema.parse({})),
  socials: z.array(z.object({ name: z.string(), url: z.url() })).default([]),
  store: storeSchema.default(null),
  seo: z.object({ title: z.string(), description: z.string() }).default({ title: "TWENTY", description: "" }),
  productInfo: productInfoSchema.default(productInfoSchema.parse({})),
  payments: paymentsSchema.default(paymentsSchema.parse({})),
  company: companySchema.default(companySchema.parse({})),
  about: aboutSchema.default(aboutSchema.parse({})),
  faqs: z.array(faqSchema).default([]),
  legal: legalSchema.default(legalSchema.parse({})),
});

/** Esquemas por clave, para validar lo que se guarda desde el admin. */
export const settingSchemas = siteSettingsSchema.shape;
export type SettingKey = keyof SiteSettings;

export async function saveSetting<K extends SettingKey>(db: Db, key: K, value: unknown): Promise<SiteSettings[K]> {
  const parsed = siteSettingsSchema.shape[key].parse(value) as SiteSettings[K];
  await db
    .insert(settings)
    .values({ key, value: parsed })
    .onConflictDoUpdate({ target: settings.key, set: { value: parsed, updatedAt: new Date() } });
  return parsed;
}

export type SiteSettings = z.infer<typeof siteSettingsSchema>;

/** Ajustes del sitio con valores por defecto: un ajuste faltante o mal formado nunca rompe la tienda. */
export async function getSiteSettings(db: Db): Promise<SiteSettings> {
  const rows = await db.select().from(settings);
  const raw = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const parsed = siteSettingsSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  // Si un ajuste está mal, se descarta solo ese.
  const result = siteSettingsSchema.parse({});
  for (const key of Object.keys(siteSettingsSchema.shape) as (keyof SiteSettings)[]) {
    const one = siteSettingsSchema.shape[key].safeParse(raw[key]);
    if (one.success) (result as Record<string, unknown>)[key] = one.data;
  }
  return result;
}

export type Slide = {
  id: string;
  title: string;
  description: string | null;
  image: string;
  imageMobile: string | null;
  href: string | null;
  ctaLabel: string | null;
  seoHeading: string | null;
};

export async function listSlidesAdmin(db: Db) {
  return db.select().from(slides).orderBy(asc(slides.position), asc(slides.createdAt));
}

export const slideInputSchema = z.object({
  title: z.string().trim().min(2, "Ponle un título").max(80),
  description: z.string().trim().max(200).nullable(),
  href: z
    .string()
    .trim()
    .max(300)
    .nullable()
    .refine((v) => !v || v.startsWith("/") || /^https?:\/\//.test(v), "El enlace debe empezar con / o con https://"),
  ctaLabel: z.string().trim().max(40).nullable(),
  seoHeading: z.string().trim().max(90).nullable(),
  isVisible: z.boolean(),
  position: z.number().int().min(0).max(99),
  image: z.string().nullable(),
  imageMobile: z.string().nullable(),
});

export async function saveSlide(db: Db, id: string | null, input: z.infer<typeof slideInputSchema>): Promise<{ ok: true } | { ok: false; message: string }> {
  const { image, imageMobile, ...rest } = input;
  if (id) {
    await db
      .update(slides)
      .set({ ...rest, ...(image ? { image } : {}), ...(imageMobile ? { imageMobile } : {}) })
      .where(eq(slides.id, id));
    return { ok: true };
  }
  if (!image) return { ok: false, message: "Sube la imagen del banner." };
  await db.insert(slides).values({ ...rest, image, imageMobile });
  return { ok: true };
}

export async function deleteSlide(db: Db, id: string) {
  await db.delete(slides).where(eq(slides.id, id));
}

export async function listVisibleSlides(db: Db): Promise<Slide[]> {
  return db
    .select({
      id: slides.id,
      title: slides.title,
      description: slides.description,
      image: slides.image,
      imageMobile: slides.imageMobile,
      href: slides.href,
      ctaLabel: slides.ctaLabel,
      seoHeading: slides.seoHeading,
    })
    .from(slides)
    .where(eq(slides.isVisible, true))
    .orderBy(asc(slides.position));
}
