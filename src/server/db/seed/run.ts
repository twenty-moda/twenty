/**
 * Carga el catálogo de desarrollo desde db/catalog_json + db/config_json (sin datos personales).
 * Uso: pnpm db:seed [--force]   (--force permite una BD que no sea localhost)
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { closeDb, getDb } from "../client";
import * as schema from "../schema";
import { buildRedirectRules, transformLegacyCatalog, type LegacyInput } from "./legacy";
import { transformLegacyContent } from "./legacy-content";

const LEGACY_REDIRECTS_FILE = "src/server/db/seed/legacy-redirects.json";

try {
  process.loadEnvFile(".env.local");
} catch {
  // Sin .env.local: se usan las variables del entorno.
}

const ROOT = process.cwd();
const readJson = <T>(file: string): T => JSON.parse(readFileSync(path.join(ROOT, file), "utf8")) as T;

function legacyUrlSlugs(): string[] {
  const slugs = new Set<string>();
  const sitemap = path.join(ROOT, "assets/seo/sitemap.xml");
  if (existsSync(sitemap)) {
    for (const [, slug] of readFileSync(sitemap, "utf8").matchAll(/\/product\/([^<"?#\s]+)/g)) slugs.add(slug);
  }
  const feed = path.join(ROOT, "assets/seo/products-feed.json");
  if (existsSync(feed)) {
    const { products } = JSON.parse(readFileSync(feed, "utf8")) as { products: { url: string }[] };
    for (const p of products) {
      const slug = p.url.split("/product/")[1];
      if (slug) slugs.add(slug);
    }
  }
  return [...slugs];
}

function fileHasher() {
  const dir = path.join(ROOT, "assets/images/item");
  if (!existsSync(dir)) {
    console.warn("⚠️  No existe assets/images/item: no se deduplican fotos ni se detectan faltantes.");
    return (filename: string) => filename;
  }
  return (filename: string) => {
    const file = path.join(dir, filename);
    return existsSync(file) ? createHash("md5").update(readFileSync(file)).digest("hex") : null;
  };
}

function assertSafeTarget() {
  const url = process.env.DATABASE_URL ?? "";
  const host = url ? new URL(url).hostname : "";
  const local = ["localhost", "127.0.0.1", "::1", "db"].includes(host);
  if (!local && !process.argv.includes("--force")) {
    throw new Error(`El seed borra y recarga el catálogo. La BD "${host}" no es local: usa --force si es intencional.`);
  }
}

async function main() {
  assertSafeTarget();

  const input: LegacyInput = {
    items: readJson("db/catalog_json/items.json"),
    attributes: readJson("db/config_json/attributes.json"),
    itemAttributes: readJson("db/catalog_json/item_attribute.json"),
    itemImages: readJson("db/catalog_json/item_images.json"),
    itemSpecs: readJson("db/catalog_json/item_specifications.json"),
    categories: readJson("db/config_json/categories.json"),
    subCategories: readJson("db/config_json/sub_categories.json"),
    categorySubCategories: readJson("db/config_json/category_sub_category.json"),
    discountRules: readJson("db/config_json/discount_rules.json"),
    sliders: readJson("db/config_json/sliders.json"),
    generals: readJson("db/config_json/generals.json"),
    socials: readJson("db/config_json/socials.json"),
    stores: readJson("db/config_json/stores.json"),
    typesDelivery: readJson("db/config_json/types_delivery.json"),
    deliveryPrices: readJson("db/catalog_json/delivery_prices.json"),
    legacyUrlSlugs: legacyUrlSlugs(),
  };

  const data = transformLegacyCatalog(input, { fileHash: fileHasher() });
  const content = transformLegacyContent({
    generals: input.generals,
    stores: input.stores,
    posts: readJson("db/config_json/posts.json"),
    blogCategories: readJson("db/config_json/blog_categories.json"),
    faqs: readJson("db/config_json/faqs.json"),
    aboutuses: readJson("db/config_json/aboutuses.json"),
    strengths: readJson("db/config_json/strengths.json"),
  });
  const db = getDb();

  await db.transaction(async (tx) => {
    // Seed de desarrollo: recarga el catálogo y borra los pedidos y clientes de prueba
    // (dependen de variantes y métodos de envío). Los usuarios del admin se conservan.
    await tx.execute(sql`
      TRUNCATE order_status_history, order_items, orders, customers,
               promotion_products, promotions, product_redirects, product_images, product_variants,
               products, category_fits, fits, categories, colors, sizes, slides, settings, posts,
               districts, shipping_methods
      CASCADE
    `);
    const insert = async (table: PgTable, rows: object[]) => {
      for (let i = 0; i < rows.length; i += 500) await tx.insert(table).values(rows.slice(i, i + 500) as never);
    };
    await insert(schema.shippingMethods, data.shippingMethods);
    await insert(schema.districts, data.districts);
    await insert(schema.categories, data.categories);
    await insert(schema.fits, data.fits);
    await insert(schema.categoryFits, data.categoryFits);
    await insert(schema.colors, data.colors);
    await insert(schema.sizes, data.sizes);
    await insert(schema.products, data.products);
    await insert(schema.productVariants, data.variants);
    await insert(schema.productImages, data.images);
    await insert(schema.productRedirects, data.redirects);
    await insert(schema.promotions, data.promotions);
    await insert(schema.promotionProducts, data.promotionProducts);
    await insert(schema.slides, data.slides);
    await insert(schema.settings, [...data.settings, ...content.settings]);
    await insert(schema.posts, content.posts);
  });

  const active = data.products.filter((p) => p.status === "active").length;
  console.log(
    [
      "✅ Catálogo cargado",
      `   ${data.products.length} productos (${active} activos), ${data.variants.length} variantes, ${data.images.length} fotos`,
      `   ${data.categories.length} categorías, ${data.fits.length} fits, ${data.colors.length} colores, ${data.sizes.length} tallas`,
      `   ${data.promotions.length} promociones, ${data.redirects.length} redirecciones de URLs anteriores`,
      `   ${content.posts.length} artículos del blog, páginas legales, preguntas frecuentes y "Nosotros"`,
      `   ${data.report.length + content.report.length} observaciones de limpieza → db/seed-report.md`,
    ].join("\n"),
  );

  // Redirecciones 308 de las URLs de la plataforma anterior: next.config.ts las carga en redirects().
  const rules = buildRedirectRules(data);
  writeFileSync(path.join(ROOT, LEGACY_REDIRECTS_FILE), `${JSON.stringify(rules, null, 2)}\n`);
  console.log(`   ${rules.length} reglas 308 → ${LEGACY_REDIRECTS_FILE}`);

  writeFileSync(
    path.join(ROOT, "db/seed-report.md"),
    [
      "# Limpieza del catálogo (generado por `pnpm db:seed`)",
      "",
      "Decisiones tomadas al convertir el catálogo anterior al modelo nuevo. Revisar con TWENTY los puntos marcados.",
      "",
      ...data.report.map((line) => `- ${line}`),
      "",
      "## Contenido (blog, páginas legales, Nosotros)",
      "",
      ...content.report.map((line) => `- ${line}`),
      "",
    ].join("\n"),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(closeDb);
