/**
 * Texto con formato simple para el blog, las páginas legales y "Nosotros".
 * Es un subconjunto de Markdown que el equipo escribe desde el admin sin editor externo:
 *
 *   ## Título            ### Subtítulo
 *   - elemento de lista  1. lista numerada
 *   > cita destacada
 *   **negrita**  *cursiva*  [texto del enlace](https://… o /catalogo)
 *
 * Una línea en blanco separa párrafos. Se convierte a nodos (no a HTML), así nunca se inyecta código.
 */

export type Inline =
  | { type: "text"; text: string }
  | { type: "strong" | "em"; children: Inline[] }
  | { type: "link"; href: string; children: Inline[] }
  | { type: "br" };

export type Block =
  | { type: "h2" | "h3" | "p" | "quote"; children: Inline[] }
  | { type: "ul" | "ol"; items: Inline[][] };

const SAFE_HREF = /^(https?:\/\/|mailto:|tel:|\/|#)/i;

/** "[texto](url)", "**negrita**" o "*cursiva*" / "_cursiva_". */
const INLINE_TOKEN = /\[([^\]\n]+)\]\(([^)\s]+)\)|\*\*(.+?)\*\*|\*(\S(?:.*?\S)?)\*|(?<![\p{L}\d])_(\S(?:.*?\S)?)_(?![\p{L}\d])/u;

export function parseInline(source: string): Inline[] {
  const out: Inline[] = [];
  const pushText = (text: string) => {
    const lines = text.split("\n");
    lines.forEach((line, i) => {
      if (i > 0) out.push({ type: "br" });
      if (!line) return;
      const last = out.at(-1);
      if (last?.type === "text") last.text += line;
      else out.push({ type: "text", text: line });
    });
  };

  let rest = source;
  while (rest) {
    const match = INLINE_TOKEN.exec(rest);
    if (!match) {
      pushText(rest);
      break;
    }
    if (match.index > 0) pushText(rest.slice(0, match.index));
    const [whole, linkText, href, strong, em, emUnderscore] = match;
    if (linkText !== undefined) {
      if (SAFE_HREF.test(href)) out.push({ type: "link", href, children: parseInline(linkText) });
      else pushText(linkText);
    } else if (strong !== undefined) {
      out.push({ type: "strong", children: parseInline(strong) });
    } else {
      out.push({ type: "em", children: parseInline(em ?? emUnderscore) });
    }
    rest = rest.slice(match.index + whole.length);
  }
  return out;
}

const HEADING = /^(#{1,3})\s+(.*)$/;
const BULLET = /^[-*•]\s+(.*)$/;
const NUMBERED = /^\d+[.)]\s+(.*)$/;
const QUOTE = /^>\s?(.*)$/;

export function parseRichText(source: string | null | undefined): Block[] {
  const blocks: Block[] = [];
  const lines = (source ?? "").replace(/\r\n?/g, "\n").split("\n");
  let paragraph: string[] = [];
  let quote: string[] = [];
  let list: { type: "ul" | "ol"; items: string[] } | null = null;

  const flush = () => {
    if (paragraph.length) blocks.push({ type: "p", children: parseInline(paragraph.join("\n")) });
    if (quote.length) blocks.push({ type: "quote", children: parseInline(quote.join("\n")) });
    if (list) blocks.push({ type: list.type, items: list.items.map(parseInline) });
    paragraph = [];
    quote = [];
    list = null;
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      flush();
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      flush();
      // "#" y "##" son títulos de sección (la página ya tiene su propio h1).
      blocks.push({ type: heading[1].length === 3 ? "h3" : "h2", children: parseInline(heading[2]) });
      continue;
    }
    const bullet = BULLET.exec(line);
    const numbered = bullet ? null : NUMBERED.exec(line);
    if (bullet || numbered) {
      const type = bullet ? "ul" : "ol";
      if (!list || list.type !== type) {
        flush();
        list = { type, items: [] };
      }
      list.items.push((bullet ?? numbered)![1]);
      continue;
    }
    const q = QUOTE.exec(line);
    if (q) {
      if (!quote.length) flush();
      quote.push(q[1]);
      continue;
    }
    if (list) {
      // Una línea sin viñeta justo después de una lista continúa el último elemento.
      list.items[list.items.length - 1] += `\n${line}`;
      continue;
    }
    if (quote.length) flush();
    paragraph.push(line);
  }
  flush();
  return blocks;
}

function inlineToPlain(nodes: Inline[]): string {
  return nodes.map((n) => (n.type === "text" ? n.text : n.type === "br" ? " " : inlineToPlain(n.children))).join("");
}

/** Texto plano (para resúmenes, meta description y llms.txt). */
export function richTextToPlain(source: string | null | undefined): string {
  return parseRichText(source)
    .map((b) => ("items" in b ? b.items.map(inlineToPlain).join(". ") : inlineToPlain(b.children)))
    .join("\n\n")
    .trim();
}

/** Primer párrafo en texto plano, recortado a `max` caracteres sin partir palabras. */
export function excerpt(source: string | null | undefined, max = 160): string {
  const first = parseRichText(source).find((b) => b.type === "p");
  const text = first && "children" in first ? inlineToPlain(first.children).replace(/\s+/g, " ").trim() : "";
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  return `${cut.slice(0, cut.lastIndexOf(" ") > 40 ? cut.lastIndexOf(" ") : cut.length).replace(/[,.;:]$/, "")}…`;
}

/** Minutos de lectura (200 palabras por minuto, mínimo 1). */
export function readingMinutes(source: string | null | undefined): number {
  const words = richTextToPlain(source).split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}
