/**
 * Convierte el HTML que guardaba el editor de la plataforma anterior (TinyMCE/Quill) al texto con formato
 * simple de la tienda nueva (src/lib/rich-text.ts). Solo cubre las etiquetas que usa el contenido de TWENTY:
 * p, br, h1-h3, strong/b, em/i, a, ul/ol/li, blockquote y span.
 */

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  aacute: "á",
  eacute: "é",
  iacute: "í",
  oacute: "ó",
  uacute: "ú",
  Aacute: "Á",
  Eacute: "É",
  Iacute: "Í",
  Oacute: "Ó",
  Uacute: "Ú",
  ntilde: "ñ",
  Ntilde: "Ñ",
  uuml: "ü",
  iexcl: "¡",
  iquest: "¿",
  laquo: "«",
  raquo: "»",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  ldquo: "“",
  rdquo: "”",
  lsquo: "‘",
  rsquo: "’",
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
    if (code[0] === "#") {
      const n = code[1].toLowerCase() === "x" ? Number.parseInt(code.slice(2), 16) : Number.parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : whole;
    }
    return ENTITIES[code] ?? whole;
  });
}

type Options = {
  /** Reescribe los enlaces (p. ej. dominios de la plataforma anterior → rutas de la tienda). null = quitar el enlace. */
  mapLink?: (href: string) => string | null;
};

/** Negrita/cursiva con los espacios fuera de los marcadores: "** hola **" → " **hola** ". */
function wrap(marker: string, inner: string): string {
  const match = /^(\s*)([\s\S]*?)(\s*)$/.exec(inner)!;
  return match[2] ? `${match[1]}${marker}${match[2]}${marker}${match[3]}` : inner;
}

function inline(html: string, options: Options): string {
  return decodeEntities(
    html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/?span[^>]*>/gi, "")
      .replace(/<a\b[^>]*?href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_, href: string, text: string) => {
        const target = options.mapLink ? options.mapLink(decodeEntities(href)) : href;
        return target ? `[${text.trim()}](${target})` : text;
      })
      .replace(/<(strong|b)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_, __, inner: string) => wrap("**", inner))
      .replace(/<(em|i)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_, __, inner: string) => wrap("*", inner))
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .trim();
}

export function htmlToRichText(html: string | null | undefined, options: Options = {}): string {
  if (!html) return "";
  const blocks: string[] = [];
  const headingLevels = [...html.matchAll(/<h([1-6])\b/gi)].map((m) => Number(m[1]));
  const topLevel = headingLevels.length ? Math.min(...headingLevels) : 2;

  const BLOCK = /<(h[1-6]|p|ul|ol|blockquote)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  let last = 0;
  for (const match of html.matchAll(BLOCK)) {
    const between = inline(html.slice(last, match.index), options);
    if (between) blocks.push(between);
    last = match.index + match[0].length;

    const tag = match[1].toLowerCase();
    const inner = match[2];
    if (tag.startsWith("h")) {
      // El nivel más alto del documento pasa a "##" (la página ya tiene su h1).
      const level = Math.min(3, 2 + Number(tag[1]) - topLevel);
      const text = inline(inner, options).replace(/\*\*/g, "").replace(/\n+/g, " ");
      if (text) blocks.push(`${"#".repeat(level)} ${text}`);
    } else if (tag === "ul" || tag === "ol") {
      const items = [...inner.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)]
        .map((li) => inline(li[1].replace(/<\/?p[^>]*>/gi, " "), options).replace(/\n+/g, " "))
        .filter(Boolean);
      if (items.length) blocks.push(items.map((text, i) => `${tag === "ul" ? "-" : `${i + 1}.`} ${text}`).join("\n"));
    } else if (tag === "blockquote") {
      const text = inline(inner.replace(/<\/p>\s*<p[^>]*>/gi, "\n"), options);
      if (text) blocks.push(text.split("\n").map((line) => `> ${line}`).join("\n"));
    } else {
      const text = inline(inner, options);
      if (text) blocks.push(text);
    }
  }
  const tail = inline(html.slice(last), options);
  if (tail) blocks.push(tail);
  return blocks.join("\n\n");
}
