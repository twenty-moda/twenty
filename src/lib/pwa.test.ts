import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

/** Las dos apps instalables: public/tienda.webmanifest (layout raíz) y public/panel.webmanifest (layout del admin). */
type Manifest = {
  id: string;
  name: string;
  short_name: string;
  start_url: string;
  scope: string;
  display: string;
  icons: { src: string; sizes: string; type: string; purpose: string }[];
  shortcuts?: { name: string; url: string }[];
};

const publicDir = path.join(process.cwd(), "public");
const read = (file: string) => JSON.parse(readFileSync(path.join(publicDir, file), "utf8")) as Manifest;
const inScope = (url: string, scope: string) => url === scope || url.startsWith(scope.endsWith("/") ? scope : `${scope}/`);

describe.each([
  ["tienda.webmanifest", "/"],
  ["panel.webmanifest", "/admin"],
])("%s", (file, scope) => {
  const manifest = read(file);

  it("se puede instalar en Android y en iPhone", () => {
    expect(manifest.display).toBe("standalone");
    expect(manifest.scope).toBe(scope);
    expect(inScope(manifest.start_url, manifest.scope)).toBe(true);
    // El nombre bajo el ícono: Android corta los largos.
    expect(manifest.short_name.length).toBeLessThanOrEqual(12);
    for (const size of ["192x192", "512x512"]) {
      expect(manifest.icons.some((i) => i.sizes === size && i.purpose === "any")).toBe(true);
      expect(manifest.icons.some((i) => i.sizes === size && i.purpose === "maskable")).toBe(true);
    }
  });

  it("cada ícono existe y mide lo que dice", async () => {
    for (const icon of manifest.icons) {
      const file = path.join(publicDir, icon.src);
      expect(existsSync(file), icon.src).toBe(true);
      const { width, height, format } = await sharp(file).metadata();
      expect(`${width}x${height}`, icon.src).toBe(icon.sizes);
      expect(`image/${format}`).toBe(icon.type);
    }
  });

  it("los accesos directos quedan dentro de la app", () => {
    for (const shortcut of manifest.shortcuts ?? []) expect(inScope(shortcut.url, manifest.scope), shortcut.url).toBe(true);
  });
});

it("la tienda y el panel son apps distintas", () => {
  const store = read("tienda.webmanifest");
  const panel = read("panel.webmanifest");
  expect(store.id).not.toBe(panel.id);
  expect(store.short_name).not.toBe(panel.short_name);
  expect(new Set(store.icons.map((i) => i.src)).isDisjointFrom(new Set(panel.icons.map((i) => i.src)))).toBe(true);
});
