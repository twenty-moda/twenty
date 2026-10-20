/**
 * Guardado de imágenes. Según las variables de entorno:
 * - Cloudflare R2 (`R2_*`, API compatible con S3): el de producción. La descarga desde R2 no se cobra.
 * - Sin R2, en desarrollo: la carpeta local assets/images (se sirve en /media por el symlink de public/media).
 * Toda imagen se convierte a WebP de máximo 1600 px con sharp. La ruta guardada en la BD es la misma en los dos
 * ("item/TMW-0001.webp"), así que cambiar de proveedor es copiar los archivos y cambiar NEXT_PUBLIC_MEDIA_URL.
 * (Hasta octubre de 2026 fue Vercel Blob: en el plan Hobby se pasó de los 10 GB de transferencia y Vercel lo bloqueó.)
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { AwsClient } from "aws4fetch";
import sharp from "sharp";

const MAX_SIZE = 1600;
/** Cada archivo tiene un nombre único (nunca se sobrescribe), así que puede quedar en caché un año. */
const CACHE_SECONDS = 31_536_000;

function r2() {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } = process.env;
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET) return null;
  const client = new AwsClient({ accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY, service: "s3", region: "auto" });
  return {
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${R2_BUCKET}`,
    /**
     * Firma con aws4fetch pero no le pasa su `Request` a fetch: dentro de Next, fetch vuelve a armar ese Request con el
     * cuerpo como stream, sin Content-Length, y R2 responde 411 a toda subida (pasó el 20/10/2026 con las fotos del
     * panel; el script de carga sí funcionaba porque corre fuera de Next). Se manda la URL con el cuerpo tal cual.
     */
    async fetch(url: string, init: { method?: string; headers?: Record<string, string>; body?: Uint8Array<ArrayBuffer> } = {}) {
      const signed = await client.sign(url, init);
      return fetch(signed.url, { method: signed.method, headers: signed.headers, body: init.body });
    },
  };
}

/**
 * Solo desarrollo y tests: carpeta local (`MEDIA_LOCAL_DIR` puede ser absoluta). El comentario evita que el bundler
 * incluya todo el proyecto en la función.
 */
const localFile = (key: string) => path.resolve(/*turbopackIgnore: true*/ process.cwd(), process.env.MEDIA_LOCAL_DIR ?? "assets/images", key);

/** Sube un archivo con esa ruta. Fuera de Vercel y sin R2, lo deja en la carpeta local. */
export async function putMedia(key: string, body: Buffer, contentType: string) {
  const remote = r2();
  if (remote) {
    const res = await remote.fetch(`${remote.endpoint}/${key}`, {
      method: "PUT",
      body: new Uint8Array(body),
      headers: { "Content-Type": contentType, "Cache-Control": `public, max-age=${CACHE_SECONDS}, immutable` },
    });
    if (!res.ok) throw new Error(`No se pudo subir ${key} a R2 (${res.status})`);
    return;
  }
  if (process.env.VERCEL) throw new Error("Falta configurar dónde guardar las imágenes: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY y R2_BUCKET.");
  const file = localFile(key);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, body);
}

/** Lee un archivo guardado (p. ej. la captura de un pago, para adjuntarla al email). `null` si no existe. */
export async function getMedia(key: string): Promise<Buffer | null> {
  const remote = r2();
  if (remote) {
    const res = await remote.fetch(`${remote.endpoint}/${key}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`No se pudo leer ${key} de R2 (${res.status})`);
    return Buffer.from(await res.arrayBuffer());
  }
  return readFile(localFile(key)).catch(() => null);
}

/** Rutas que ya están en R2 (para los scripts que suben en lote y saltan las que ya existen). */
export async function listMediaKeys(): Promise<Set<string>> {
  const remote = r2();
  if (!remote) throw new Error("Faltan las variables R2_*.");
  const keys = new Set<string>();
  let token: string | undefined;
  do {
    const query = new URLSearchParams({ "list-type": "2", "max-keys": "1000", ...(token ? { "continuation-token": token } : {}) });
    const res = await remote.fetch(`${remote.endpoint}?${query}`);
    if (!res.ok) throw new Error(`No se pudo listar R2 (${res.status})`);
    const xml = await res.text();
    for (const [, key] of xml.matchAll(/<Key>([^<]*)<\/Key>/g)) keys.add(decodeXml(key));
    token = /<IsTruncated>true<\/IsTruncated>/.test(xml) ? decodeXml(/<NextContinuationToken>([^<]*)</.exec(xml)?.[1] ?? "") : undefined;
  } while (token);
  return keys;
}

const decodeXml = (text: string) =>
  text.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");

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
  await putMedia(key, webp, "image/webp");
  return key;
}
