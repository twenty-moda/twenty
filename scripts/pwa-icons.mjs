/**
 * Íconos de las dos apps instalables (tienda y panel) desde el isotipo T-20 de la marca.
 * Uso: node scripts/pwa-icons.mjs  (escribe en public/icons/; los PNG se suben al repo)
 *
 * - tienda-*: como el favicon (negro, aro y letras blancas).
 * - panel-*: el mismo invertido (blanco), así no se confunde con la tienda si las dos están en el mismo teléfono.
 * - *-maskable-*: Android recorta el ícono en círculo, gota o cuadrado: el aro va al 78 % para que nunca se corte.
 *
 * El isotipo solo existe en JPEG de 300 px (falta el vector, ver brand/BRAND.md): el de 512 sale un poco suave.
 */
import { mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "..");
const source = path.join(root, "brand/logos/twenty-icon-t20.jpg");
const out = path.join(root, "public/icons");
await mkdir(out, { recursive: true });

const base = (invert) => {
  const image = sharp(source).removeAlpha();
  return invert ? image.negate({ alpha: false }) : image;
};

async function plain(name, size, invert) {
  await base(invert).resize(size, size, { kernel: "lanczos3" }).png({ compressionLevel: 9 }).toFile(path.join(out, name));
}

async function maskable(name, size, invert) {
  const inner = Math.round(size * 0.78);
  const art = await base(invert).resize(inner, inner, { kernel: "lanczos3" }).png().toBuffer();
  const background = invert ? "#ffffff" : "#000000";
  await sharp({ create: { width: size, height: size, channels: 3, background } })
    .composite([{ input: art, gravity: "center" }])
    .png({ compressionLevel: 9 })
    .toFile(path.join(out, name));
}

for (const [prefix, invert] of [
  ["tienda", false],
  ["panel", true],
]) {
  await plain(`${prefix}-192.png`, 192, invert);
  await plain(`${prefix}-512.png`, 512, invert);
  await maskable(`${prefix}-maskable-192.png`, 192, invert);
  await maskable(`${prefix}-maskable-512.png`, 512, invert);
}
// iPhone y iPad usan el apple-touch-icon y no el manifest. El de la tienda es src/app/apple-icon.png.
await plain("panel-apple-180.png", 180, true);
console.log("Íconos listos en public/icons/");
