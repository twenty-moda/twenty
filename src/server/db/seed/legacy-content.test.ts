import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { excerpt, parseRichText } from "@/lib/rich-text";
import type { SiteSettings } from "@/server/services/content";
import { htmlToRichText } from "./html-to-rich-text";
import { transformLegacyContent, type LegacyContentInput } from "./legacy-content";

describe("htmlToRichText", () => {
  it("convierte el HTML del editor anterior", () => {
    const html =
      '<h1>Título</h1><h2>Sección</h2><p>Hola <strong>mundo</strong> y <em>estilo</em>.</p><p><br></p><ul><li>uno</li><li><br></li><li>dos</li></ul>' +
      '<blockquote><strong>Tip:</strong> confía.</blockquote><p><span class="ql-size-small">Ver <a href="https://twentymoda.com/catalogo">catálogo</a>&nbsp;&amp; más</span></p>';
    expect(htmlToRichText(html, { mapLink: (h) => h.replace("https://twentymoda.com", "") })).toBe(
      ["## Título", "### Sección", "Hola **mundo** y *estilo*.", "- uno\n- dos", "> **Tip:** confía.", "Ver [catálogo](/catalogo) & más"].join("\n\n"),
    );
  });

  it("deja los espacios fuera de las negritas", () => {
    expect(htmlToRichText("<p><strong>Ruc: </strong>2061</p>")).toBe("**Ruc:** 2061");
  });
});

describe("transformLegacyContent con el contenido real de TWENTY", () => {
  const json = <T>(name: string): T => JSON.parse(readFileSync(path.join(process.cwd(), `db/config_json/${name}.json`), "utf8")) as T;
  const input: LegacyContentInput = {
    generals: json("generals"),
    posts: json("posts"),
    blogCategories: json("blog_categories"),
    faqs: json("faqs"),
    aboutuses: json("aboutuses"),
    strengths: json("strengths"),
    stores: json("stores"),
  };
  const out = transformLegacyContent(input);
  const settings = Object.fromEntries(out.settings.map((s) => [s.key, s.value])) as Pick<SiteSettings, "company" | "about" | "faqs" | "legal">;
  const allText = JSON.stringify({ posts: out.posts, settings: out.settings });

  it("no quedan etiquetas HTML, campos de plantilla ni enlaces al proveedor anterior", () => {
    expect(allText).not.toMatch(/<\/?(p|strong|span|h\d|li|ul|br)\b/);
    expect(allText).not.toMatch(/\[Nombre de tu Tienda\]|\[Fecha actual\]|Nota legal|WooCommerce/);
    expect(allText).not.toMatch(/mundoweb/);
  });

  it("empresa, páginas legales y Nosotros", () => {
    expect(settings.company).toMatchObject({ legalName: "Multiventa Peruano S.A.C.", ruc: "20612934020" });
    for (const key of ["terms", "privacy", "shipping", "returns"] as const) {
      expect(settings.legal[key].body.length).toBeGreaterThan(500);
      expect(parseRichText(settings.legal[key].body).some((b) => b.type === "h2")).toBe(true);
    }
    expect(settings.legal.shipping.body).not.toContain("Zona de Destino");
    expect(settings.about.strengths).toHaveLength(4);
    expect(settings.about.quote).toContain("nosotros las dominamos");
  });

  it("blog y preguntas frecuentes", () => {
    expect(out.posts).toHaveLength(7);
    for (const p of out.posts) {
      expect(p.image).toMatch(/^post\/.+\.webp$/);
      expect(excerpt(p.body, 200).length).toBeGreaterThan(50);
      expect(p.category).toBeTruthy();
    }
    expect(settings.faqs).toHaveLength(4);
    expect(settings.faqs.every((f) => !/Donec/.test(f.question))).toBe(true);
  });
});
