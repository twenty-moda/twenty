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
import type { Courier } from "../../lib/couriers";

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
/** "single" = prenda con variantes propias; "outfit" = conjunto de varias prendas (ver outfit_pieces). */
export const productKind = pgEnum("product_kind", ["single", "outfit"]);
/** Documento de un cliente (pedidos web y ventas en tienda). */
export const documentType = pgEnum("document_type", ["dni", "ce", "pasaporte", "ruc"]);

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
    kind: productKind().notNull().default("single"),
    /** Solo conjuntos: precio del conjunto completo (las prendas salen del stock de cada una). */
    outfitPriceCents: integer(),
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

/**
 * Piezas de un conjunto: cada una es otra prenda del catálogo y el cliente elige su color y talla. El stock es el de
 * esas prendas, así que se comparte con su venta por separado. Una prenda que es pieza no se puede borrar (restrict).
 */
export const outfitPieces = pgTable(
  "outfit_pieces",
  {
    outfitId: uuid()
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    position: integer().notNull(),
    productId: uuid()
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    /** Cómo se llama la pieza en la ficha ("Camisa", "Pantalón"); vacío = el nombre de su categoría. */
    label: text(),
  },
  (t) => [primaryKey({ columns: [t.outfitId, t.position] }), index("outfit_pieces_product_idx").on(t.productId)],
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

// ─── Inventario ──────────────────────────────────────────────────────────────

/**
 * Almacenes y tiendas. Uno solo vende en la web (`sellsOnline`): su stock es `product_variants.stock`, que la tienda
 * lee y descuenta como siempre, e `inventory_levels` lo refleja. El de los demás vive solo en `inventory_levels`.
 */
export const warehouses = pgTable(
  "warehouses",
  {
    id: uuid().primaryKey().defaultRandom(),
    name: text().notNull().unique(),
    /** Código corto para etiquetas y reportes ("GAM", "SJM"). */
    code: text().notNull().unique(),
    address: text(),
    sellsOnline: boolean().notNull().default(false),
    isActive: boolean().notNull().default(true),
    position: integer().notNull().default(0),
    ...timestamps,
  },
  (t) => [uniqueIndex("warehouses_sells_online_uq").on(t.sellsOnline).where(sql`${t.sellsOnline}`)],
);

/** Stock de cada variante en cada almacén. Solo se escribe desde `server/services/stock.ts`. */
export const inventoryLevels = pgTable(
  "inventory_levels",
  {
    variantId: uuid()
      .notNull()
      .references(() => productVariants.id, { onDelete: "cascade" }),
    warehouseId: uuid()
      .notNull()
      .references(() => warehouses.id, { onDelete: "restrict" }),
    quantity: integer().notNull().default(0),
    updatedAt: timestamps.updatedAt,
  },
  (t) => [
    primaryKey({ columns: [t.variantId, t.warehouseId] }),
    index("inventory_levels_warehouse_idx").on(t.warehouseId),
    check("inventory_levels_quantity_non_negative", sql`${t.quantity} >= 0`),
  ],
);

export const stockMovementType = pgEnum("stock_movement_type", [
  "inicial",
  "ingreso",
  "venta_web",
  "anulacion_web",
  "venta_tienda",
  "anulacion_tienda",
  "traslado_salida",
  "traslado_entrada",
  "ajuste",
  "conteo",
  "devolucion_proveedor",
]);

/** Kardex: cada cambio de stock de una variante en un almacén, con el saldo que dejó. */
export const stockMovements = pgTable(
  "stock_movements",
  {
    id: uuid().primaryKey().defaultRandom(),
    variantId: uuid()
      .notNull()
      .references(() => productVariants.id, { onDelete: "cascade" }),
    warehouseId: uuid()
      .notNull()
      .references(() => warehouses.id, { onDelete: "restrict" }),
    type: stockMovementType().notNull(),
    /** Positivo = entra, negativo = sale. */
    quantity: integer().notNull(),
    balanceAfter: integer().notNull(),
    /** Costo unitario en céntimos (ingresos), para el kardex valorizado. */
    unitCostCents: integer(),
    orderId: uuid().references(() => orders.id, { onDelete: "set null" }),
    operationId: uuid().references(() => stockOperations.id, { onDelete: "set null" }),
    posSaleId: uuid().references(() => posSales.id, { onDelete: "set null" }),
    userId: uuid().references(() => users.id, { onDelete: "set null" }),
    note: text(),
    createdAt: timestamps.createdAt,
  },
  (t) => [
    index("stock_movements_variant_idx").on(t.variantId, t.warehouseId, t.createdAt),
    index("stock_movements_created_idx").on(t.createdAt),
    index("stock_movements_order_idx").on(t.orderId),
    index("stock_movements_operation_idx").on(t.operationId),
    check("stock_movements_quantity_non_zero", sql`${t.quantity} <> 0`),
  ],
);

export const stockOperationKind = pgEnum("stock_operation_kind", ["ingreso", "traslado", "salida"]);

/** Lo que se registra desde Inventario → Movimientos: un ingreso, un traslado o una salida, con sus prendas en el kardex. */
export const stockOperations = pgTable(
  "stock_operations",
  {
    id: uuid().primaryKey().defaultRandom(),
    /** Número visible ("Operación #12"). */
    number: integer().notNull().unique().generatedAlwaysAsIdentity({ startWith: 1 }),
    kind: stockOperationKind().notNull(),
    fromWarehouseId: uuid().references(() => warehouses.id, { onDelete: "restrict" }),
    toWarehouseId: uuid().references(() => warehouses.id, { onDelete: "restrict" }),
    note: text(),
    userId: uuid().references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamps.createdAt,
  },
  (t) => [index("stock_operations_created_idx").on(t.createdAt)],
);

// ─── Tienda: punto de venta y caja ───────────────────────────────────────────

export const posDocumentType = pgEnum("pos_document_type", ["nota_venta", "boleta", "factura"]);

/** Series de cada tienda (NV05, B005, F005…). El correlativo sale de `next_number` en la transacción de la venta. */
export const documentSeries = pgTable(
  "document_series",
  {
    id: uuid().primaryKey().defaultRandom(),
    warehouseId: uuid()
      .notNull()
      .references(() => warehouses.id, { onDelete: "restrict" }),
    documentType: posDocumentType().notNull(),
    series: text().notNull().unique(),
    nextNumber: integer().notNull().default(1),
    ...timestamps,
  },
  (t) => [uniqueIndex("document_series_warehouse_type_uq").on(t.warehouseId, t.documentType)],
);

/** Caja de una tienda: se abre con un monto inicial y se cierra con el arqueo. Una abierta por tienda a la vez. */
export const cashSessions = pgTable(
  "cash_sessions",
  {
    id: uuid().primaryKey().defaultRandom(),
    number: integer().notNull().unique().generatedAlwaysAsIdentity({ startWith: 1 }),
    warehouseId: uuid()
      .notNull()
      .references(() => warehouses.id, { onDelete: "restrict" }),
    openingCents: integer().notNull(),
    openedBy: uuid().references(() => users.id, { onDelete: "set null" }),
    openedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    /** Al cerrar: el efectivo que debía haber y el que se contó. */
    expectedCashCents: integer(),
    countedCashCents: integer(),
    closingNote: text(),
    closedBy: uuid().references(() => users.id, { onDelete: "set null" }),
    closedAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    uniqueIndex("cash_sessions_one_open_uq").on(t.warehouseId).where(sql`${t.closedAt} is null`),
    index("cash_sessions_opened_idx").on(t.openedAt),
    check("cash_sessions_opening_non_negative", sql`${t.openingCents} >= 0`),
  ],
);

export const cashMovementType = pgEnum("cash_movement_type", ["ingreso", "egreso"]);

/** Efectivo que entra o sale de la caja sin ser una venta (sencillo, pago a un proveedor, retiro). */
export const cashMovements = pgTable(
  "cash_movements",
  {
    id: uuid().primaryKey().defaultRandom(),
    sessionId: uuid()
      .notNull()
      .references(() => cashSessions.id, { onDelete: "cascade" }),
    type: cashMovementType().notNull(),
    amountCents: integer().notNull(),
    note: text().notNull(),
    userId: uuid().references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamps.createdAt,
  },
  (t) => [index("cash_movements_session_idx").on(t.sessionId), check("cash_movements_amount_positive", sql`${t.amountCents} > 0`)],
);

export const posSaleStatus = pgEnum("pos_sale_status", ["pagada", "anulada"]);
/** Boleta o factura en SUNAT (por la API de Mathyu's Solutions). La nota de venta no va a SUNAT. */
export const posSunatStatus = pgEnum("pos_sunat_status", ["pendiente", "aceptado", "rechazado"]);

/** Venta en tienda. Los datos del cliente se copian: en tienda casi nunca hay email ni celular (los pide `customers`). */
export const posSales = pgTable(
  "pos_sales",
  {
    id: uuid().primaryKey().defaultRandom(),
    documentType: posDocumentType().notNull(),
    series: text().notNull(),
    number: integer().notNull(),
    warehouseId: uuid()
      .notNull()
      .references(() => warehouses.id, { onDelete: "restrict" }),
    cashSessionId: uuid()
      .notNull()
      .references(() => cashSessions.id, { onDelete: "restrict" }),
    sellerId: uuid().references(() => users.id, { onDelete: "set null" }),
    customerDocumentType: documentType(),
    customerDocumentNumber: text(),
    customerName: text(),
    /** Dirección fiscal (factura). */
    customerAddress: text(),
    /** Solo boleta y factura: null = nota de venta. "pendiente" = aún sin respuesta de SUNAT (se reintenta). */
    sunatStatus: posSunatStatus(),
    sunatCode: text(),
    sunatMessage: text(),
    /** Valor resumen (hash de la firma) que va impreso. */
    sunatHash: text(),
    /** Enlaces de la API: ticket de 80 mm y A4 en PDF, XML firmado y CDR. */
    sunatTicketUrl: text(),
    sunatPdfUrl: text(),
    sunatXmlUrl: text(),
    sunatCdrUrl: text(),
    sunatSentAt: timestamp({ withTimezone: true }),
    /** Al anular una boleta o factura aceptada: estado de la baja en SUNAT (PENDIENTE hasta que SUNAT la procesa). */
    sunatVoidStatus: text(),
    /** Precio de lista de las prendas. */
    subtotalCents: integer().notNull(),
    /** Promos "N x S/" (las mismas de la web). */
    promoDiscountCents: integer().notNull().default(0),
    /** Descuento que da la tienda sobre el total. */
    manualDiscountCents: integer().notNull().default(0),
    /** Envío cobrado aparte (no es una prenda: no mueve stock). */
    shippingCents: integer().notNull().default(0),
    totalCents: integer().notNull(),
    changeCents: integer().notNull().default(0),
    status: posSaleStatus().notNull().default("pagada"),
    note: text(),
    voidedAt: timestamp({ withTimezone: true }),
    voidedBy: uuid().references(() => users.id, { onDelete: "set null" }),
    voidReason: text(),
    createdAt: timestamps.createdAt,
  },
  (t) => [
    uniqueIndex("pos_sales_series_number_uq").on(t.series, t.number),
    index("pos_sales_session_idx").on(t.cashSessionId),
    index("pos_sales_created_idx").on(t.createdAt),
    check("pos_sales_total_non_negative", sql`${t.totalCents} >= 0`),
  ],
);

export const posSaleItems = pgTable(
  "pos_sale_items",
  {
    id: uuid().primaryKey().defaultRandom(),
    saleId: uuid()
      .notNull()
      .references(() => posSales.id, { onDelete: "cascade" }),
    variantId: uuid().references(() => productVariants.id, { onDelete: "set null" }),
    productId: uuid().references(() => products.id, { onDelete: "set null" }),
    sku: text().notNull(),
    productName: text().notNull(),
    colorName: text().notNull(),
    sizeLabel: text().notNull(),
    unitPriceCents: integer().notNull(),
    quantity: integer().notNull(),
    /** Parte de la promo "N x S/" que le toca a esta línea. */
    discountCents: integer().notNull().default(0),
    totalCents: integer().notNull(),
    promotionName: text(),
  },
  (t) => [index("pos_sale_items_sale_idx").on(t.saleId), index("pos_sale_items_variant_idx").on(t.variantId), check("pos_sale_items_quantity_positive", sql`${t.quantity} > 0`)],
);

export const posPaymentMethod = pgEnum("pos_payment_method", ["efectivo", "yape", "plin", "tarjeta", "transferencia"]);

/** Cómo se pagó: una venta puede pagarse con varios medios. En efectivo se guarda lo recibido (el vuelto sale de ahí). */
export const posPayments = pgTable(
  "pos_payments",
  {
    id: uuid().primaryKey().defaultRandom(),
    saleId: uuid()
      .notNull()
      .references(() => posSales.id, { onDelete: "cascade" }),
    method: posPaymentMethod().notNull(),
    amountCents: integer().notNull(),
    receivedCents: integer(),
    /** N° de operación de Yape, Plin, la tarjeta o la transferencia. */
    reference: text(),
  },
  (t) => [index("pos_payments_sale_idx").on(t.saleId), check("pos_payments_amount_positive", sql`${t.amountCents} > 0`)],
);

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

/** "vendedor" = equipo de la tienda: en el panel solo ve el punto de venta, la caja y las ventas en tienda. */
export const userRole = pgEnum("user_role", ["admin", "customer", "vendedor"]);
export type UserRole = (typeof userRole.enumValues)[number];

export const users = pgTable("users", {
  id: uuid().primaryKey().defaultRandom(),
  /** `users.id` (bigint) de la plataforma anterior, para enlazar pedidos migrados. */
  legacyId: integer().unique(),
  name: text().notNull(),
  /** Siempre en minúsculas. */
  email: text().notNull().unique(),
  phone: text(),
  /**
   * Hash bcrypt de la web anterior (Laravel, `$2y$`). No se usa para entrar (las contraseñas viven en Firebase):
   * sirve para pasar esas cuentas a Firebase con `firebase auth:import --hash-algo=BCRYPT` en la migración final.
   */
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
    /** Id de la agencia en el sistema del courier (Shalom: `ter_id`; Olva: `code`), si se eligió de la lista. */
    agencyId: text(),
    /** Guía del courier para el seguimiento (Shalom: número de orden de 8 dígitos y código de 4; Olva: N° de tracking y año de emisión con 2 dígitos). */
    trackingNumber: text(),
    trackingCode: text(),

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
    /**
     * Prenda vendida dentro de un conjunto: una fila por pieza (con su variante, para el stock y el empaque) y el precio
     * del conjunto repartido entre las piezas. `outfitLine` agrupa las piezas de un mismo conjunto en el pedido.
     */
    outfitId: uuid(),
    outfitName: text(),
    outfitLine: integer(),
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

export const refundReason = pgEnum("refund_reason", ["agotado", "cortesia", "cliente", "otro"]);
export const refundMethod = pgEnum("refund_method", ["culqi", "manual"]);
export const refundStatus = pgEnum("refund_status", ["pendiente", "hecha"]);

/**
 * Dinero devuelto al cliente, con o sin anular el pedido. `culqi`: se le pidió a Culqi sobre un cargo (`paymentId`);
 * `manual`: el equipo lo devolvió por su cuenta (Yape, Plin, transferencia) y aquí solo se registra.
 * `pendiente`: se le pidió a Culqi y no respondió (se confirma a mano en el panel). Cuenta como devuelta para que
 * nunca se devuelva dos veces. Si Culqi la rechaza, la fila se borra.
 */
export const refunds = pgTable(
  "refunds",
  {
    id: uuid().primaryKey().defaultRandom(),
    orderId: uuid()
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    paymentId: uuid().references(() => payments.id, { onDelete: "set null" }),
    method: refundMethod().notNull(),
    status: refundStatus().notNull(),
    /** Id de la devolución en Culqi (ref_…). */
    providerId: text().unique(),
    amountCents: integer().notNull(),
    reason: refundReason().notNull(),
    /** Nota interna del equipo. */
    note: text(),
    /** Mensaje para el cliente (va en el email y en la página del pedido). */
    customerMessage: text(),
    raw: jsonb(),
    createdBy: uuid().references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamps.createdAt,
  },
  (t) => [index("refunds_order_idx").on(t.orderId, t.createdAt), check("refunds_amount_positive", sql`${t.amountCents} > 0`)],
);

/** Prendas que no se envían porque se agotaron (motivo "agotado"). Si luego se anula el pedido, no vuelven al stock. */
export const refundItems = pgTable(
  "refund_items",
  {
    refundId: uuid()
      .notNull()
      .references(() => refunds.id, { onDelete: "cascade" }),
    orderItemId: uuid()
      .notNull()
      .references(() => orderItems.id, { onDelete: "cascade" }),
    quantity: integer().notNull(),
  },
  (t) => [primaryKey({ columns: [t.refundId, t.orderItemId] }), check("refund_items_quantity_positive", sql`${t.quantity} > 0`)],
);

/**
 * Captura del pago con Yape/Plin que sube el cliente en la página de su pedido. La imagen va en el bucket de fotos
 * (`comprobantes/<id>.webp`, WebP achicado de unos 50–150 KB): el id no se adivina. Hasta octubre de 2026 iba dentro
 * de la BD; TWENTY pidió pasarla al bucket (no es confidencial) para no gastar la transferencia de Neon.
 */
export const paymentProofs = pgTable(
  "payment_proofs",
  {
    id: uuid().primaryKey().defaultRandom(),
    orderId: uuid()
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    /** Ruta en el bucket, como las fotos de productos. */
    path: text().notNull(),
    width: integer().notNull(),
    height: integer().notNull(),
    createdAt: timestamps.createdAt,
  },
  (t) => [index("payment_proofs_order_idx").on(t.orderId, t.createdAt)],
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

export const contactReplyChannel = pgEnum("contact_reply_channel", ["email", "whatsapp"]);

/** Respuestas del equipo a un mensaje de contacto: por email (sale desde la tienda) o por WhatsApp (se abre con el texto). */
export const contactReplies = pgTable(
  "contact_replies",
  {
    id: uuid().primaryKey().defaultRandom(),
    messageId: uuid()
      .notNull()
      .references(() => contactMessages.id, { onDelete: "cascade" }),
    channel: contactReplyChannel().notNull(),
    body: text().notNull(),
    sentBy: uuid().references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamps.createdAt,
  },
  (t) => [index("contact_replies_message_idx").on(t.messageId, t.createdAt)],
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
    /** Agencia elegida de la lista del courier (Shalom: `ter_id`; Olva: `code`). */
    agencyId: text(),
    /** De qué courier es `agencyId` (los ids de Shalom y Olva se pueden repetir). */
    agencyCourier: text().$type<Courier>(),
    isDefault: boolean().notNull().default(false),
    ...timestamps,
  },
  (t) => [index("addresses_user_idx").on(t.userId)],
);
