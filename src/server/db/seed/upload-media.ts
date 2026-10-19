/**
 * Sube a R2 las imágenes que usa la BD (fotos de productos, categorías, banners, blog, "Nosotros"),
 * desde assets/images y con el mismo nombre ("item/TMW-0001.webp"). Salta las que ya están: se puede repetir.
 * Solo las usadas, no las 1.023 del kit.
 *
 * Uso: DATABASE_URL=<BD> R2_ACCOUNT_ID=… R2_ACCESS_KEY_ID=… R2_SECRET_ACCESS_KEY=… R2_BUCKET=… pnpm media:upload
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import { listMediaKeys, putMedia } from "../../storage";
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

async function main() {
  const wanted = await usedPaths();
  const missingLocal = wanted.filter((p) => !existsSync(path.join(ROOT, p)));
  const existing = await listMediaKeys();
  const pending = wanted.filter((p) => !existing.has(p) && !missingLocal.includes(p));
  console.log(`${wanted.length} imágenes usadas · ${existing.size} ya en R2 · ${pending.length} por subir · ${missingLocal.length} sin archivo local`);
  for (const p of missingLocal) console.warn(`  ⚠️  falta assets/images/${p}`);

  let done = 0;
  const queue = [...pending];
  const worker = async () => {
    for (let p = queue.shift(); p; p = queue.shift()) {
      await putMedia(p, readFileSync(path.join(ROOT, p)), CONTENT_TYPES[path.extname(p).toLowerCase()] ?? "application/octet-stream");
      if (++done % 25 === 0 || done === pending.length) console.log(`  ${done}/${pending.length}`);
    }
  };
  await Promise.all(Array.from({ length: 8 }, worker));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(closeDb);
