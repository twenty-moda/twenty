import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// Columnas en camelCase en TS y snake_case en Postgres (casing: "snake_case" en el cliente y en drizzle-kit).

const timestamps = {
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

export const productStatus = pgEnum("product_status", ["active", "draft", "archived"]);
export const gender = pgEnum("gender", ["hombre", "mujer", "unisex"]);
export const promotionType = pgEnum("promotion_type", ["bundle_price"]);

// ─── Catálogo ────────────────────────────────────────────────────────────────

export const categories = pgTable("categories", {
  id: uuid().primaryKey().defaultRandom(),
  slug: text().notNull().unique(),
  name: text().notNull(),
  description: text(),
  image: text(),
  position: integer().notNull().default(0),
  isVisible: boolean().notNull().default(true),
  ...timestamps,
});

/** Cortes: Baggy Jean, Boxi Fit, Oversize… (en la plataforma anterior, "subcategorías"). */
export const fits = pgTable("fits", {
  id: uuid().primaryKey().defaultRandom(),
  slug: text().notNull().unique(),
  name: text().notNull(),
  image: text(),
  position: integer().notNull().default(0),
  isVisible: boolean().notNull().default(true),
  ...timestamps,
});

export const categoryFits = pgTable(
  "category_fits",
  {
    categoryId: uuid()
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    fitId: uuid()
      .notNull()
      .references(() => fits.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.categoryId, t.fitId] })],
);

export const colors = pgTable("colors", {
  id: uuid().primaryKey().defaultRandom(),
  slug: text().notNull().unique(),
  name: text().notNull(),
  /** Aproximado, solo para el punto del filtro. Los lavados de jean no llevan hex. */
  hex: text(),
  position: integer().notNull().default(0),
});

export const sizes = pgTable("sizes", {
  id: uuid().primaryKey().defaultRandom(),
  label: text().notNull().unique(),
  position: integer().notNull().default(0),
});

export const products = pgTable(
  "products",
  {
    id: uuid().primaryKey().defaultRandom(),
    slug: text().notNull().unique(),
    name: text().notNull(),
    description: text(),
    /** Medidas por talla en texto libre (viene de item_specifications). */
    sizeGuide: text(),
    categoryId: uuid()
      .notNull()
      .references(() => categories.id),
    fitId: uuid().references(() => fits.id, { onDelete: "set null" }),
    gender: gender().notNull().default("hombre"),
    status: productStatus().notNull().default("draft"),
    isFeatured: boolean().notNull().default(false),
    position: integer().notNull().default(0),
    metaTitle: text(),
    metaDescription: text(),
    ...timestamps,
  },
  (t) => [index("products_category_idx").on(t.categoryId), index("products_status_idx").on(t.status)],
);

/** Una variante = un color + una talla, con SKU, precio y stock propios. */
export const productVariants = pgTable(
  "product_variants",
  {
    id: uuid().primaryKey().defaultRandom(),
    productId: uuid()
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    sku: text().notNull().unique(),
    colorId: uuid()
      .notNull()
      .references(() => colors.id),
    sizeId: uuid()
      .notNull()
      .references(() => sizes.id),
    /** Precio de venta en céntimos de sol. */
    priceCents: integer().notNull(),
    /** Precio anterior (tachado) si hay descuento. */
    compareAtPriceCents: integer(),
    stock: integer().notNull().default(0),
    isActive: boolean().notNull().default(true),
    position: integer().notNull().default(0),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("product_variants_option_uq").on(t.productId, t.colorId, t.sizeId),
    index("product_variants_product_idx").on(t.productId),
    check("product_variants_stock_non_negative", sql`${t.stock} >= 0`),
    check("product_variants_price_positive", sql`${t.priceCents} > 0`),
  ],
);

/** Las fotos son por producto + color (todas las tallas de un color comparten fotos). */
export const productImages = pgTable(
  "product_images",
  {
    id: uuid().primaryKey().defaultRandom(),
    productId: uuid()
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    colorId: uuid().references(() => colors.id, { onDelete: "set null" }),
    /** Ruta relativa a la base de medios, p. ej. "item/TMW-0001.webp". */
    path: text().notNull(),
    alt: text(),
    position: integer().notNull().default(0),
    createdAt: timestamps.createdAt,
  },
  (t) => [index("product_images_product_idx").on(t.productId)],
);

/** Slugs antiguos (variantes y URLs del sitemap anterior) → producto, para redirigir con 308. */
export const productRedirects = pgTable("product_redirects", {
  fromSlug: text().primaryKey(),
  productId: uuid()
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  variantId: uuid().references(() => productVariants.id, { onDelete: "set null" }),
});

// ─── Promociones ─────────────────────────────────────────────────────────────

/** "Lleva N por S/ X" (bundle_price). Las reglas de la plataforma anterior se convierten a este formato. */
export const promotions = pgTable("promotions", {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull(),
  description: text(),
  type: promotionType().notNull(),
  quantity: integer().notNull(),
  bundlePriceCents: integer().notNull(),
  isActive: boolean().notNull().default(true),
  startsAt: timestamp({ withTimezone: true }),
  endsAt: timestamp({ withTimezone: true }),
  priority: integer().notNull().default(0),
  ...timestamps,
});

export const promotionProducts = pgTable(
  "promotion_products",
  {
    promotionId: uuid()
      .notNull()
      .references(() => promotions.id, { onDelete: "cascade" }),
    productId: uuid()
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.promotionId, t.productId] })],
);

// ─── Contenido ───────────────────────────────────────────────────────────────

export const slides = pgTable("slides", {
  id: uuid().primaryKey().defaultRandom(),
  title: text().notNull(),
  description: text(),
  image: text().notNull(),
  imageMobile: text(),
  href: text(),
  ctaLabel: text(),
  /** H1 para SEO cuando el texto del banner está dentro de la imagen. */
  seoHeading: text(),
  isVisible: boolean().notNull().default(true),
  position: integer().notNull().default(0),
  ...timestamps,
});

/** Ajustes del sitio en clave-valor (cintillo, contacto, redes, SEO). Se validan con Zod al leer. */
export const settings = pgTable("settings", {
  key: text().primaryKey(),
  value: jsonb().notNull(),
  updatedAt: timestamps.updatedAt,
});

// ─── Usuarios y sesiones ─────────────────────────────────────────────────────

export const userRole = pgEnum("user_role", ["admin", "customer"]);

export const users = pgTable("users", {
  id: uuid().primaryKey().defaultRandom(),
  /** `users.id` (bigint) de la plataforma anterior, para enlazar pedidos migrados. */
  legacyId: integer().unique(),
  name: text().notNull(),
  /** Siempre en minúsculas. */
  email: text().notNull().unique(),
  phone: text(),
  /** bcrypt. Los hashes migrados de Laravel ($2y$) se validan tal cual. */
  passwordHash: text(),
  /** Cuenta de Google vinculada (uid de Firebase Authentication). Los clientes entran solo con Google. */
  firebaseUid: text().unique(),
  photoUrl: text(),
  role: userRole().notNull().default("customer"),
  isActive: boolean().notNull().default(true),
  lastLoginAt: timestamp({ withTimezone: true }),
  ...timestamps,
});

/** Sesiones en BD (revocables). El id es el SHA-256 del token de la cookie: el token nunca se guarda. */
/** "admin" = panel (email + contraseña); "cuenta" = cuenta de cliente en la tienda (Google). Una no sirve para la otra. */
export const sessionScope = pgEnum("session_scope", ["admin", "cuenta"]);

export const sessions = pgTable(
  "sessions",
  {
    id: text().primaryKey(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    scope: sessionScope().notNull().default("admin"),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    userAgent: text(),
    createdAt: timestamps.createdAt,
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

/** Intentos de login fallidos, para frenar ataques de fuerza bruta. */
export const loginAttempts = pgTable(
  "login_attempts",
  {
    id: uuid().primaryKey().defaultRandom(),
    key: text().notNull(),
    createdAt: timestamps.createdAt,
  },
  (t) => [index("login_attempts_key_idx").on(t.key, t.createdAt)],
);

// ─── Envíos ──────────────────────────────────────────────────────────────────

export const shippingKind = pgEnum("shipping_kind", ["lima_delivery", "agency", "store_pickup"]);

/** Delivery Lima (motorizado), agencias (Shalom, Olva) y recojo en tienda. */
export const shippingMethods = pgTable("shipping_methods", {
  id: uuid().primaryKey().defaultRandom(),
  slug: text().notNull().unique(),
  name: text().notNull(),
  description: text(),
  /** Viñetas que ve el cliente en el checkout. */
  details: jsonb().$type<string[]>().notNull().default([]),
  kind: shippingKind().notNull(),
  /** El flete se paga al recoger (agencias). */
  paymentOnDelivery: boolean().notNull().default(false),
  isActive: boolean().notNull().default(true),
  position: integer().notNull().default(0),
  ...timestamps,
});

/** Distritos del Perú con código ubigeo (RENIEC, como en la plataforma anterior). */
export const districts = pgTable(
  "districts",
  {
    ubigeo: text().primaryKey(),
    name: text().notNull(),
    province: text().notNull(),
    department: text().notNull(),
    /** Precio del delivery en motorizado; null = no llega el delivery (solo agencia o recojo). */
    deliveryPriceCents: integer(),
  },
  (t) => [index("districts_department_idx").on(t.department, t.province)],
);

// ─── Clientes y pedidos ──────────────────────────────────────────────────────

export const documentType = pgEnum("document_type", ["dni", "ce", "pasaporte", "ruc"]);

/** Cliente = quien compra (con o sin cuenta). Se identifica por email. */
export const customers = pgTable(
  "customers",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid().references(() => users.id, { onDelete: "set null" }),
    name: text().notNull(),
    email: text().notNull().unique(),
    phone: text().notNull(),
    documentType: documentType(),
    documentNumber: text(),
    notes: text(),
    ...timestamps,
  },
  (t) => [index("customers_phone_idx").on(t.phone)],
);

export const orderStatus = pgEnum("order_status", [
  "pendiente",
  "por_verificar",
  "pagado",
  "en_preparacion",
  "enviado",
  "entregado",
  "anulado",
  "rechazado",
]);
export const paymentMethod = pgEnum("payment_method", ["yape_plin", "whatsapp", "tarjeta"]);
export const invoiceType = pgEnum("invoice_type", ["boleta", "factura"]);

export type AppliedPromotion = { id: string; name: string; quantity: number; bundlePriceCents: number; discountCents: number };

export const orders = pgTable(
  "orders",
  {
    id: uuid().primaryKey().defaultRandom(),
    /** Número visible para el cliente y el equipo (#1001, #1002…). */
    number: integer().notNull().unique().generatedAlwaysAsIdentity({ startWith: 1001 }),
    customerId: uuid()
      .notNull()
      .references(() => customers.id),
    status: orderStatus().notNull().default("pendiente"),

    // Datos del comprador tal como los escribió en este pedido.
    customerName: text().notNull(),
    email: text().notNull(),
    phone: text().notNull(),
    documentType: documentType().notNull(),
    documentNumber: text().notNull(),
    invoiceType: invoiceType().notNull().default("boleta"),
    businessName: text(),
    ruc: text(),

    // Entrega.
    shippingMethodId: uuid().references(() => shippingMethods.id, { onDelete: "set null" }),
    shippingMethodName: text().notNull(),
    shippingKind: shippingKind().notNull(),
    paymentOnDelivery: boolean().notNull().default(false),
    ubigeo: text(),
    department: text(),
    province: text(),
    district: text(),
    address: text(),
    addressReference: text(),
    /** Agencia de destino (Shalom, Olva) donde el cliente recoge. */
    agencyName: text(),

    paymentMethod: paymentMethod().notNull(),
    subtotalCents: integer().notNull(),
    discountCents: integer().notNull().default(0),
    shippingCents: integer().notNull().default(0),
    totalCents: integer().notNull(),
    promotions: jsonb().$type<AppliedPromotion[]>().notNull().default([]),

    customerNote: text(),
    internalNote: text(),
    /** Se devolvió el stock al anular/rechazar (evita devolverlo dos veces). */
    stockRestoredAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("orders_status_idx").on(t.status, t.createdAt),
    index("orders_customer_idx").on(t.customerId),
    index("orders_created_idx").on(t.createdAt),
  ],
);

export const orderItems = pgTable(
  "order_items",
  {
    id: uuid().primaryKey().defaultRandom(),
    orderId: uuid()
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    variantId: uuid().references(() => productVariants.id, { onDelete: "set null" }),
    productId: uuid(),
    productName: text().notNull(),
    productSlug: text().notNull(),
    sku: text().notNull(),
    colorName: text().notNull(),
    sizeLabel: text().notNull(),
    image: text(),
    unitPriceCents: integer().notNull(),
    compareAtPriceCents: integer(),
    quantity: integer().notNull(),
    discountCents: integer().notNull().default(0),
    totalCents: integer().notNull(),
  },
  (t) => [index("order_items_order_idx").on(t.orderId), check("order_items_quantity_positive", sql`${t.quantity} > 0`)],
);

/** Cobros en pasarela (Culqi). providerId = id del cargo (chr_…): único, así un cargo nunca se registra dos veces. */
export const payments = pgTable(
  "payments",
  {
    id: uuid().primaryKey().defaultRandom(),
    orderId: uuid()
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    provider: text().notNull(),
    providerId: text().notNull().unique(),
    /** "tarjeta" o "yape" */
    method: text().notNull(),
    status: text().notNull(),
    amountCents: integer().notNull(),
    raw: jsonb(),
    createdAt: timestamps.createdAt,
  },
  (t) => [index("payments_order_idx").on(t.orderId)],
);

export const orderStatusHistory = pgTable(
  "order_status_history",
  {
    id: uuid().primaryKey().defaultRandom(),
    orderId: uuid()
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    fromStatus: orderStatus(),
    toStatus: orderStatus().notNull(),
    /** Nota interna del equipo. */
    note: text(),
    /** Mensaje para el cliente (va en el email del cambio de estado y en la página del pedido), p. ej. la clave de Shalom. */
    customerMessage: text(),
    /** Quién hizo el cambio (null = el cliente o el sistema). */
    changedBy: uuid().references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamps.createdAt,
  },
  (t) => [index("order_status_history_order_idx").on(t.orderId, t.createdAt)],
);

// ─── Blog, mensajes y Libro de Reclamaciones ─────────────────────────────────

/** Artículos del blog (/blogs, /post/[slug]). El cuerpo es texto con formato simple (ver src/lib/rich-text.ts). */
export const posts = pgTable(
  "posts",
  {
    id: uuid().primaryKey().defaultRandom(),
    slug: text().notNull().unique(),
    title: text().notNull(),
    /** Resumen para la lista y Google. */
    summary: text(),
    body: text().notNull().default(""),
    image: text(),
    category: text(),
    author: text(),
    isPublished: boolean().notNull().default(false),
    publishedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    metaTitle: text(),
    metaDescription: text(),
    ...timestamps,
  },
  (t) => [index("posts_published_idx").on(t.isPublished, t.publishedAt)],
);

/** Mensajes del formulario de /contacto. */
export const contactMessages = pgTable(
  "contact_messages",
  {
    id: uuid().primaryKey().defaultRandom(),
    name: text().notNull(),
    email: text().notNull(),
    phone: text(),
    message: text().notNull(),
    /** Cuándo lo atendió el equipo (null = nuevo). */
    handledAt: timestamp({ withTimezone: true }),
    createdAt: timestamps.createdAt,
  },
  (t) => [index("contact_messages_created_idx").on(t.createdAt)],
);

/** Suscriptores del boletín (pie de página). */
export const subscribers = pgTable("subscribers", {
  id: uuid().primaryKey().defaultRandom(),
  /** Siempre en minúsculas. */
  email: text().notNull().unique(),
  createdAt: timestamps.createdAt,
});

export const complaintType = pgEnum("complaint_type", ["reclamo", "queja"]);
export const complaintItemType = pgEnum("complaint_item_type", ["producto", "servicio"]);

/**
 * Libro de Reclamaciones virtual (Código de Protección y Defensa del Consumidor, D.S. 011-2011-PCM).
 * Cada hoja tiene un número correlativo y se conserva al menos 2 años: no se borra desde el admin.
 */
export const complaints = pgTable(
  "complaints",
  {
    id: uuid().primaryKey().defaultRandom(),
    number: integer().notNull().unique().generatedAlwaysAsIdentity({ startWith: 1 }),
    type: complaintType().notNull(),

    // 1. Consumidor reclamante.
    name: text().notNull(),
    documentType: documentType().notNull(),
    documentNumber: text().notNull(),
    phone: text().notNull(),
    email: text().notNull(),
    address: text().notNull(),
    ubigeo: text(),
    district: text(),
    province: text(),
    department: text(),
    /** Si es menor de edad, los datos del padre, madre o apoderado. */
    isMinor: boolean().notNull().default(false),
    guardianName: text(),
    guardianDocument: text(),

    // 2. Bien contratado.
    itemType: complaintItemType().notNull(),
    amountCents: integer(),
    itemDescription: text().notNull(),
    orderNumber: text(),
    incidentDate: text(),

    // 3. Detalle.
    detail: text().notNull(),
    request: text().notNull(),

    // 4. Respuesta del proveedor (plazo: 15 días hábiles).
    response: text(),
    respondedAt: timestamp({ withTimezone: true }),
    respondedBy: uuid().references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamps.createdAt,
  },
  (t) => [index("complaints_created_idx").on(t.createdAt)],
);

/** Registro de intentos para limitar formularios públicos (clave = acción + hash de la IP). */
export const rateLimitHits = pgTable(
  "rate_limit_hits",
  {
    id: uuid().primaryKey().defaultRandom(),
    key: text().notNull(),
    createdAt: timestamps.createdAt,
  },
  (t) => [index("rate_limit_hits_key_idx").on(t.key, t.createdAt)],
);

// ─── Cuentas de cliente ──────────────────────────────────────────────────────

export const addressKind = pgEnum("address_kind", ["delivery", "agency"]);

/**
 * Direcciones guardadas de una cuenta: delivery en Lima (distrito + dirección) o recojo en agencia para provincia
 * (ciudad + agencia). Se eligen en el checkout con un toque.
 */
export const addresses = pgTable(
  "addresses",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: addressKind().notNull(),
    /** "Casa", "Trabajo"… */
    label: text().notNull(),
    ubigeo: text().notNull(),
    address: text(),
    reference: text(),
    agencyName: text(),
    isDefault: boolean().notNull().default(false),
    ...timestamps,
  },
  (t) => [index("addresses_user_idx").on(t.userId)],
);
