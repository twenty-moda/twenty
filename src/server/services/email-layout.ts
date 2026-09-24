/**
 * Diseño de los emails de TWENTY. Cada email es una lista de bloques (texto, botón, prendas, totales…) que se
 * convierte a HTML y a texto plano con el mismo contenido. El HTML usa tablas y estilos en línea, lo único que
 * respetan Gmail, Outlook y Apple Mail: franja negra con el logo, contenido en blanco, ancho máximo 600 px y
 * botones de ancho completo (cómodos en el teléfono, donde se lee la mayoría).
 */
import { absoluteMediaUrl, appUrl, whatsappUrl } from "@/lib/links";
import type { SiteSettings } from "./content";
import { escapeHtml } from "./email";

export type EmailItem = { name: string; detail: string; price: string; image: string | null };

export type EmailBlock =
  | { type: "text"; text: string; muted?: boolean; small?: boolean; strong?: boolean }
  | { type: "button"; label: string; url: string; secondary?: boolean }
  | { type: "rows"; title?: string; rows: [string, string][] }
  | { type: "items"; items: EmailItem[] }
  | { type: "totals"; rows: { label: string; value: string; strong?: boolean; accent?: boolean }[] }
  | { type: "progress"; steps: string[]; current: number }
  | { type: "steps"; items: string[] }
  | { type: "image"; src: string; alt: string; width: number }
  | { type: "box"; title?: string; blocks: EmailBlock[] }
  | { type: "divider" };

export type EmailContent = {
  /** Texto que el buzón muestra junto al asunto. */
  preheader: string;
  /** Línea chica sobre el título, p. ej. "Pedido #1001". */
  eyebrow?: string;
  /** "danger" pinta el eyebrow de rojo (pedido anulado). */
  tone?: "default" | "danger";
  title: string;
  blocks: EmailBlock[];
  /** Emails para el equipo: pie corto, sin enlaces para clientes. */
  audience?: "customer" | "team";
};

export type EmailBrand = {
  baseUrl: string;
  legalName: string;
  ruc: string;
  address: string;
  whatsapp: string;
  socials: { name: string; url: string }[];
};

export function emailBrand(settings: Pick<SiteSettings, "company" | "contact" | "socials">, baseUrl = appUrl()): EmailBrand {
  return {
    baseUrl,
    legalName: settings.company.legalName,
    ruc: settings.company.ruc,
    address: settings.company.address,
    whatsapp: settings.contact.whatsapp,
    socials: settings.socials,
  };
}

/** Imagen del bucket o de /public con URL absoluta (los emails no resuelven rutas relativas). */
export const emailImageUrl = (path: string, brand: EmailBrand) => absoluteMediaUrl(path, brand.baseUrl);

// ─── HTML ────────────────────────────────────────────────────────────────────

const FONT = "'Libre Franklin',Helvetica,Arial,sans-serif";
const INK = "#111111";
const MUTED = "#6b6b6b";
const LINE = "#e6e6e6";
const SOFT = "#f3f3f3";
const GREEN = "#0a7d34";
const RED = "#e0002a";

const esc = (text: string) => escapeHtml(text).replace(/\n/g, "<br>");
const table = (inner: string, style = "", attrs = "") =>
  `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;${style}"${attrs}>${inner}</table>`;

function blockHtml(block: EmailBlock, brand: EmailBrand): string {
  switch (block.type) {
    case "text": {
      const size = block.small ? 13 : 16;
      const color = block.muted ? MUTED : INK;
      return `<p style="margin:0 0 14px;font:${block.strong ? 700 : 400} ${size}px/1.55 ${FONT};color:${color}">${esc(block.text)}</p>`;
    }
    case "button": {
      const bg = block.secondary ? "#ffffff" : "#000000";
      const fg = block.secondary ? "#000000" : "#ffffff";
      // border-collapse: separate, si no el borde de la celda no toma el redondeo.
      return (
        `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:separate;margin:8px 0 12px">` +
        `<tr><td align="center" bgcolor="${bg}" style="border:2px solid #000000;border-radius:999px">` +
        `<a href="${escapeHtml(block.url)}" target="_blank" style="display:block;padding:15px 20px;font:700 14px/1.2 ${FONT};letter-spacing:1.5px;text-transform:uppercase;color:${fg};text-decoration:none;border-radius:999px">${esc(block.label)}</a>` +
        `</td></tr></table>`
      );
    }
    case "rows":
      return (
        (block.title ? heading(block.title) : "") +
        table(
          block.rows
            .map(
              ([label, value]) =>
                `<tr><td style="padding:7px 12px 7px 0;width:38%;vertical-align:top;font:400 13px/1.45 ${FONT};color:${MUTED}">${esc(label)}</td>` +
                `<td style="padding:7px 0;vertical-align:top;font:400 14px/1.45 ${FONT};color:${INK}">${esc(value)}</td></tr>`,
            )
            .join(""),
          "margin:0 0 12px",
        )
      );
    case "items":
      return table(
        block.items
          .map(
            (item, i) =>
              `<tr><td width="72" style="padding:${i ? 14 : 0}px 14px 0 0;vertical-align:top">` +
              (item.image
                ? `<img src="${escapeHtml(emailImageUrl(item.image, brand))}" width="72" height="96" alt="" style="display:block;width:72px;height:96px;border-radius:8px;background:${SOFT};border:0">`
                : `<div style="width:72px;height:96px;border-radius:8px;background:${SOFT}"></div>`) +
              `</td><td style="padding:${i ? 14 : 0}px 0 0;vertical-align:top;font:600 15px/1.35 ${FONT};color:${INK}">${esc(item.name)}` +
              `<div style="margin-top:4px;font:400 13px/1.4 ${FONT};color:${MUTED}">${esc(item.detail)}</div></td>` +
              `<td align="right" style="padding:${i ? 14 : 0}px 0 0 12px;vertical-align:top;white-space:nowrap;font:600 15px/1.35 ${FONT};color:${INK}">${esc(item.price)}</td></tr>`,
          )
          .join(""),
        "margin:0 0 16px",
      );
    case "totals":
      return table(
        block.rows
          .map((row) => {
            const color = row.accent ? GREEN : row.strong ? INK : MUTED;
            const font = row.strong ? `800 18px/1.3 ${FONT}` : `400 14px/1.4 ${FONT}`;
            const border = row.strong ? `border-top:1px solid ${LINE};` : "";
            const pad = row.strong ? "12px 0 0" : "4px 0";
            return `<tr><td style="${border}padding:${pad};font:${font};color:${color}">${esc(row.label)}</td><td align="right" style="${border}padding:${pad};font:${font};color:${color};white-space:nowrap">${esc(row.value)}</td></tr>`;
          })
          .join(""),
        `border-top:1px solid ${LINE};padding-top:8px;margin:0 0 8px`,
      );
    case "progress": {
      const width = Math.floor(100 / block.steps.length);
      const bars = block.steps
        .map((_, i) => `<td width="${width}%" style="padding:0 2px"><div style="height:6px;border-radius:3px;background:${i <= block.current ? "#000000" : LINE};font-size:0;line-height:0">&nbsp;</div></td>`)
        .join("");
      const labels = block.steps
        .map(
          (label, i) =>
            `<td width="${width}%" align="center" style="padding:8px 2px 0;vertical-align:top;font:${i === block.current ? 700 : 400} 11px/1.3 ${FONT};color:${i === block.current ? INK : MUTED}">${esc(label)}</td>`,
        )
        .join("");
      return table(`<tr>${bars}</tr><tr>${labels}</tr>`, "margin:4px 0 24px;table-layout:fixed");
    }
    case "steps":
      return table(
        block.items
          .map(
            (text, i) =>
              `<tr><td width="30" style="padding:0 10px 10px 0;vertical-align:top"><div style="width:26px;height:26px;border-radius:13px;background:#000000;color:#ffffff;text-align:center;font:700 13px/26px ${FONT}">${i + 1}</div></td>` +
              `<td style="padding:3px 0 10px;vertical-align:top;font:400 15px/1.45 ${FONT};color:${INK}">${esc(text)}</td></tr>`,
          )
          .join(""),
        "margin:4px 0 8px",
      );
    case "image":
      return `<div style="margin:4px 0 16px;text-align:center"><img src="${escapeHtml(emailImageUrl(block.src, brand))}" width="${block.width}" alt="${escapeHtml(block.alt)}" style="display:inline-block;width:${block.width}px;max-width:100%;height:auto;border:0;border-radius:12px"></div>`;
    case "box":
      return table(
        `<tr><td style="padding:20px 20px 8px;background:${SOFT};border-radius:14px">${block.title ? heading(block.title) : ""}${block.blocks.map((b) => blockHtml(b, brand)).join("")}</td></tr>`,
        "margin:8px 0 20px",
      );
    case "divider":
      return `<div style="height:1px;background:${LINE};margin:20px 0;font-size:0;line-height:0">&nbsp;</div>`;
  }
}

const heading = (text: string) => `<p style="margin:0 0 12px;font:800 12px/1.3 ${FONT};letter-spacing:2px;text-transform:uppercase;color:${INK}">${esc(text)}</p>`;

function footerHtml(brand: EmailBrand, audience: EmailContent["audience"]): string {
  const link = (label: string, url: string) =>
    `<a href="${escapeHtml(url)}" target="_blank" style="color:#ffffff;text-decoration:none;font:700 12px/1 ${FONT};letter-spacing:1.5px;text-transform:uppercase">${esc(label)}</a>`;
  const small = (html: string) => `<p style="margin:0 0 8px;font:400 12px/1.6 ${FONT};color:#9a9a9a">${html}</p>`;
  const legal = [brand.legalName, brand.ruc && `RUC ${brand.ruc}`, brand.address].filter(Boolean).map((t) => escapeHtml(t)).join(" · ");
  if (audience === "team") return small(`Aviso automático de la tienda TWENTY.${legal ? `<br>${legal}` : ""}`);

  const socials = [...brand.socials.map((s) => link(s.name, s.url)), ...(brand.whatsapp ? [link("WhatsApp", whatsappUrl(brand.whatsapp))] : [])];
  const muted = (label: string, path: string) => `<a href="${escapeHtml(brand.baseUrl + path)}" target="_blank" style="color:#9a9a9a;text-decoration:underline">${esc(label)}</a>`;
  return [
    socials.length ? `<p style="margin:0 0 18px">${socials.join(`<span style="color:#555555">&nbsp;&nbsp;·&nbsp;&nbsp;</span>`)}</p>` : "",
    small(`¿Dudas? Responde este correo${brand.whatsapp ? ` o escríbenos por WhatsApp al ${escapeHtml(brand.whatsapp)}` : ""}.`),
    legal ? small(legal) : "",
    small([muted("Libro de Reclamaciones", "/libro-de-reclamaciones"), muted("Términos", "/terminos-y-condiciones"), muted("Privacidad", "/politica-de-privacidad")].join(" &nbsp;·&nbsp; ")),
  ].join("");
}

export function renderEmailHtml(content: EmailContent, brand: EmailBrand): string {
  const logo = `${brand.baseUrl}/brand/twenty-logo-email.png`;
  const eyebrowColor = content.tone === "danger" ? RED : MUTED;
  // Relleno invisible para que el buzón no muestre el resto del email después del preheader.
  const filler = "&#8199;&#847;".repeat(60);
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(content.title)}</title>
<link href="https://fonts.googleapis.com/css2?family=Libre+Franklin:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>
  body{margin:0;padding:0;-webkit-text-size-adjust:100%}
  img{-ms-interpolation-mode:bicubic}
  @media (max-width:620px){.outer{padding:0!important}.card{border-radius:0!important}.px{padding-left:20px!important;padding-right:20px!important}.title{font-size:26px!important}}
</style>
</head>
<body style="margin:0;padding:0;background:${SOFT}">
<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all">${escapeHtml(content.preheader)}${filler}</div>
${table(
  `<tr><td class="outer" align="center" style="padding:24px 12px">
${table(
  `<tr><td class="card px" align="center" bgcolor="#000000" style="padding:30px 40px;border-radius:16px 16px 0 0">
<a href="${escapeHtml(brand.baseUrl)}" target="_blank" style="text-decoration:none"><img src="${escapeHtml(logo)}" width="200" height="48" alt="TWENTY" style="display:block;width:200px;height:auto;border:0;font:800 26px/48px ${FONT};letter-spacing:6px;color:#ffffff"></a>
</td></tr>
<tr><td class="px" bgcolor="#ffffff" style="padding:36px 40px 28px">
${content.eyebrow ? `<p style="margin:0 0 10px;font:700 12px/1.3 ${FONT};letter-spacing:2px;text-transform:uppercase;color:${eyebrowColor}">${esc(content.eyebrow)}</p>` : ""}
<h1 class="title" style="margin:0 0 18px;font:800 30px/1.1 ${FONT};letter-spacing:-0.5px;text-transform:uppercase;color:#000000">${esc(content.title)}</h1>
${content.blocks.map((b) => blockHtml(b, brand)).join("\n")}
</td></tr>
<tr><td class="card px" bgcolor="#000000" style="padding:28px 40px;border-radius:0 0 16px 16px">
${footerHtml(brand, content.audience)}
</td></tr>`,
  "max-width:600px",
  ` class="container"`,
)}
</td></tr>`,
  `background:${SOFT}`,
)}
</body>
</html>`;
}

// ─── Texto plano ─────────────────────────────────────────────────────────────

function blockText(block: EmailBlock): string[] {
  switch (block.type) {
    case "text":
      return [block.text, ""];
    case "button":
      return [`${block.label}: ${block.url}`, ""];
    case "rows":
      return [...(block.title ? [block.title.toUpperCase()] : []), ...block.rows.map(([k, v]) => `${k}: ${v}`), ""];
    case "items":
      return [...block.items.map((i) => `- ${i.name} (${i.detail}): ${i.price}`), ""];
    case "totals":
      return [...block.rows.map((r) => `${r.label}: ${r.value}`), ""];
    case "progress":
      return [`Estado: ${block.steps[block.current] ?? ""} (paso ${block.current + 1} de ${block.steps.length})`, ""];
    case "steps":
      return [...block.items.map((t, i) => `${i + 1}. ${t}`), ""];
    case "image":
      return [];
    case "box":
      return [...(block.title ? [block.title.toUpperCase()] : []), ...block.blocks.flatMap(blockText)];
    case "divider":
      return ["—", ""];
  }
}

export function renderEmailText(content: EmailContent, brand: EmailBrand): string {
  const footer =
    content.audience === "team"
      ? ["Aviso automático de la tienda TWENTY."]
      : [
          `¿Dudas? Responde este correo${brand.whatsapp ? ` o escríbenos por WhatsApp al ${brand.whatsapp}` : ""}.`,
          [brand.legalName, brand.ruc && `RUC ${brand.ruc}`].filter(Boolean).join(" · "),
          `Libro de Reclamaciones: ${brand.baseUrl}/libro-de-reclamaciones`,
        ];
  return [
    "TWENTY",
    "",
    ...(content.eyebrow ? [content.eyebrow.toUpperCase()] : []),
    content.title,
    "",
    ...content.blocks.flatMap(blockText),
    "—",
    ...footer.filter(Boolean),
  ]
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function renderBrandedEmail(content: EmailContent, brand: EmailBrand): { html: string; text: string } {
  return { html: renderEmailHtml(content, brand), text: renderEmailText(content, brand) };
}
