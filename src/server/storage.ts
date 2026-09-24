/**
 * Guardado de imágenes. Según las variables de entorno:
 * - Vercel Blob (`BLOB_READ_WRITE_TOKEN`, o `BLOB_STORE_ID` con el token OIDC de Vercel): el de producción.
 * - Cloudflare R2 (`R2_*`, API compatible con S3): alternativa si algún día conviene cambiar.
 * - Sin ninguno, en desarrollo: la carpeta local assets/images (se sirve en /media por el symlink de public/media).
 * Toda imagen se convierte a WebP de máximo 1600 px con sharp. La ruta guardada en la BD es la misma en los tres
 * ("item/TMW-0001.webp"), así que cambiar de proveedor es copiar los archivos y cambiar NEXT_PUBLIC_MEDIA_URL.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { put as blobPut } from "@vercel/blob";
import { AwsClient } from "aws4fetch";
import sharp from "sharp";

const MAX_SIZE = 1600;
/** Cada archivo tiene un nombre único (nunca se sobrescribe), así que puede quedar en caché un año. */
const CACHE_SECONDS = 31_536_000;

const blobConfigured = () => !!(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);

function r2() {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } = process.env;
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET) return null;
  return {
    client: new AwsClient({ accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY, service: "s3", region: "auto" }),
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${R2_BUCKET}`,
  };
}

async function put(key: string, body: Buffer, contentType: string) {
  if (blobConfigured()) {
    // Una sola operación (sin multipart): el plan Hobby incluye pocas operaciones de escritura al mes.
    await blobPut(key, body, { access: "public", contentType, cacheControlMaxAge: CACHE_SECONDS, addRandomSuffix: false, multipart: false });
    return;
  }
  const remote = r2();
  if (remote) {
    const res = await remote.client.fetch(`${remote.endpoint}/${key}`, {
      method: "PUT",
      body: new Uint8Array(body),
      headers: { "Content-Type": contentType, "Cache-Control": `public, max-age=${CACHE_SECONDS}, immutable` },
    });
    if (!res.ok) throw new Error(`No se pudo subir ${key} a R2 (${res.status})`);
    return;
  }
  if (process.env.VERCEL) throw new Error("Falta configurar dónde guardar las imágenes: conecta un Blob store (BLOB_READ_WRITE_TOKEN) o R2.");
  // Solo desarrollo: carpeta local. El comentario evita que el bundler incluya todo el proyecto en la función.
  const file = path.join(/*turbopackIgnore: true*/ process.cwd(), process.env.MEDIA_LOCAL_DIR ?? "assets/images", key);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, body);
}

export class InvalidImageError extends Error {}

/**
 * Convierte y guarda una imagen. Devuelve la ruta relativa al almacenamiento (p. ej. "item/TMW-0001-a1b2c3d4.webp"),
 * que es lo que se guarda en la BD. `baseName` debe ser único (quien llama le agrega un sufijo al azar).
 */
export async function saveImage(input: ArrayBuffer | Buffer, folder: string, baseName: string): Promise<string> {
  let webp: Buffer;
  try {
    webp = await sharp(Buffer.from(input as ArrayBuffer))
      .rotate() // respeta la orientación de las fotos del celular
      .resize({ width: MAX_SIZE, height: MAX_SIZE, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();
  } catch {
    throw new InvalidImageError("El archivo no es una imagen válida (usa JPG, PNG o WebP).");
  }
  const safeName = baseName
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  const key = `${folder}/${safeName || "imagen"}.webp`;
  await put(key, webp, "image/webp");
  return key;
}
