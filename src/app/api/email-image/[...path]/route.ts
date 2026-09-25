import sharp from "sharp";
import { absoluteMediaUrl } from "@/lib/links";
import { EMAIL_IMAGE_WIDTHS } from "@/lib/email-images";

/**
 * Fotos para los emails en JPEG: las del bucket son WebP y algunos programas de correo (Outlook de escritorio, sobre
 * todo) no lo muestran. Cada archivo del bucket tiene un nombre único, así que la versión JPEG se queda en el CDN.
 * Solo rutas del bucket ("item/TMW-0001.webp") y anchos fijos.
 */
const MEDIA_PATH = /^[a-z0-9_-]+(\/[A-Za-z0-9._-]+)+\.(webp|jpe?g|png|avif)$/i;

export async function GET(request: Request, { params }: RouteContext<"/api/email-image/[...path]">) {
  const key = (await params).path.join("/");
  if (!MEDIA_PATH.test(key) || key.includes("..")) return new Response("No encontrado", { status: 404 });
  const requested = Number(new URL(request.url).searchParams.get("w"));
  const width = EMAIL_IMAGE_WIDTHS.find((w) => w >= requested) ?? EMAIL_IMAGE_WIDTHS.at(-1)!;

  const source = await fetch(absoluteMediaUrl(key, new URL(request.url).origin), { signal: AbortSignal.timeout(15_000) }).catch(() => null);
  if (!source?.ok) return new Response("No encontrado", { status: 404 });
  const jpeg = await sharp(Buffer.from(await source.arrayBuffer()))
    .resize({ width, withoutEnlargement: true })
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();
  return new Response(new Uint8Array(jpeg), {
    headers: { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=31536000, s-maxage=31536000, immutable" },
  });
}
