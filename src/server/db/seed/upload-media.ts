/**
 * Sube a Vercel Blob las imágenes que usa la BD (fotos de productos, categorías, banners, blog, "Nosotros"),
 * desde assets/images y con el mismo nombre ("item/TMW-0001.webp"). Salta las que ya están: se puede repetir.
 * Solo las usadas, no las 1.023 del kit: el plan Hobby incluye pocas operaciones de escritura al mes.
 *
 * Uso: DATABASE_URL=<BD> BLOB_READ_WRITE_TOKEN=<token> pnpm media:upload
 *      (o BLOB_STORE_ID + VERCEL_OIDC_TOKEN en lugar del token)
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { list, put } from "@vercel/blob";
import { sql } from "drizzle-orm";
import { closeDb, getDb } from "../client";

const ROOT = path.join(process.cwd(), "assets/images");
const CONTENT_TYPES: Record<string, string> = { ".webp": "image/webp", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".avif": "image/avif" };

async function usedPaths(): Promise<string[]> {
  const rows = await getDb().execute<{ path: string }>(sql`
    select path from product_images
    union select image from categories where image is not null
    union select image from fits where image is not null
    union select image from slides
    union select image_mobile from slides where image_mobile is not null
    union select image from posts where image is not null
    union select value->>'image' from settings where key = 'about' and value->>'image' is not null
    union select s->>'icon' from settings, jsonb_array_elements(value->'strengths') s where key = 'about' and s->>'icon' is not null
  `);
  // Las que empiezan con "/" son archivos de /public (van con el despliegue).
  return rows.map((r) => r.path).filter((p) => p && !p.startsWith("/")).sort();
}

async function existingPaths(): Promise<Set<string>> {
  const found = new Set<string>();
  let cursor: string | undefined;
  do {
    const page = await list({ cursor, limit: 1000 });
    for (const blob of page.blobs) found.add(blob.pathname);
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return found;
}

async function main() {
  const wanted = await usedPaths();
  const missingLocal = wanted.filter((p) => !existsSync(path.join(ROOT, p)));
  const existing = await existingPaths();
  const pending = wanted.filter((p) => !existing.has(p) && !missingLocal.includes(p));
  console.log(`${wanted.length} imágenes usadas · ${existing.size} ya en Blob · ${pending.length} por subir · ${missingLocal.length} sin archivo local`);
  for (const p of missingLocal) console.warn(`  ⚠️  falta assets/images/${p}`);

  let done = 0;
  let baseUrl = "";
  const queue = [...pending];
  const worker = async () => {
    for (let p = queue.shift(); p; p = queue.shift()) {
      const result = await put(p, readFileSync(path.join(ROOT, p)), {
        access: "public",
        contentType: CONTENT_TYPES[path.extname(p).toLowerCase()] ?? "application/octet-stream",
        cacheControlMaxAge: 31_536_000,
        addRandomSuffix: false,
        multipart: false,
      });
      baseUrl ||= result.url.slice(0, result.url.length - p.length - 1);
      if (++done % 25 === 0 || done === pending.length) console.log(`  ${done}/${pending.length}`);
    }
  };
  // Pocas en paralelo: el plan Hobby permite ~15 escrituras por segundo.
  await Promise.all(Array.from({ length: 4 }, worker));
  if (baseUrl) console.log(`\nNEXT_PUBLIC_MEDIA_URL=${baseUrl}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(closeDb);
