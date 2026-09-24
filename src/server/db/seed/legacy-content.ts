/**
 * Contenido editable de la web anterior → tienda nueva: blog, preguntas frecuentes, "Nosotros",
 * páginas legales y datos de la empresa. Se corrige lo que estaba roto y se anota en db/seed-report.md.
 */
import { htmlToRichText } from "./html-to-rich-text";
import { normalizeInternalLink, type LegacyGeneral, type LegacyStore } from "./legacy";

type Flag = "0" | "1" | string | null;

export type LegacyPost = {
  id: string;
  name: string;
  description: string | null;
  image: string | null;
  post_date: string | null;
  status: Flag;
  category_id: string | null;
  slug: string;
  author: string | null;
  created_at: string | null;
};
export type LegacyBlogCategory = { id: string; name: string };
export type LegacyFaq = { question: string; answer: string; status: Flag };
export type LegacyAboutus = { correlative: string; title: string | null; name: string; description: string | null; image: string | null; visible: Flag; status: Flag };
export type LegacyStrength = { name: string; description: string | null; image: string | null; visible: Flag; status: Flag; order_index: string | null };

export type LegacyContentInput = {
  generals: LegacyGeneral[];
  posts: LegacyPost[];
  blogCategories: LegacyBlogCategory[];
  faqs: LegacyFaq[];
  aboutuses: LegacyAboutus[];
  strengths: LegacyStrength[];
  stores: LegacyStore[];
};

export type SeedPost = {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  body: string;
  image: string | null;
  category: string | null;
  author: string | null;
  isPublished: boolean;
  publishedAt: Date;
};

const isOn = (flag: Flag) => flag === "1";
const collapse = (value: string) => value.replace(/\s+/g, " ").trim();

/** Enlaces del contenido: twentymoda.com → ruta interna; el dominio de pruebas del proveedor anterior → catálogo. */
function contentLink(report: Set<string>) {
  return (href: string): string | null => {
    if (/mundoweb\.pe/i.test(href)) {
      report.add(`Había enlaces al dominio de pruebas del proveedor anterior (${new URL(href).hostname}); se cambiaron a /catalogo.`);
      const path = href.replace(/^https?:\/\/[^/]+/i, "");
      return path && path !== "/" ? normalizeInternalLink(path) : "/catalogo";
    }
    return normalizeInternalLink(href) ?? null;
  };
}

/** Quita el <h1> inicial: la página muestra su propio título. */
const dropLeadingTitle = (html: string) => html.replace(/^\s*<h1\b[^>]*>[\s\S]*?<\/h1>/i, "");

/** "**2. PRODUCTOS** Todos nuestros…" → título de sección + párrafo. */
function promoteNumberedHeadings(text: string): string {
  return text
    .split("\n\n")
    .map((block) => {
      const match = /^\*\*(\d+\.\s[^*]+?)\s*\*\*\s*([\s\S]*)$/.exec(block);
      return match ? [`## ${collapse(match[1])}`, match[2].trim()].filter(Boolean).join("\n\n") : block;
    })
    .join("\n\n");
}

export function transformLegacyContent(input: LegacyContentInput) {
  const report = new Set<string>();
  const mapLink = contentLink(report);
  const general = new Map(input.generals.map((g) => [g.correlative, g.status === "0" ? "" : (g.description ?? "").trim()]));
  const store = input.stores[0];
  const contactEmail = general.get("email_contact") ?? "";

  // ── Empresa ──
  const aboutHistory = input.aboutuses.find((a) => a.correlative === "section-historia");
  const legalMatch = /([A-ZÁÉÍÓÚÑ][\wÁÉÍÓÚÑáéíóúñ ]+S\.A\.C\.?)<\/strong>\s*\(RUC:\s*(\d{11})\)/i.exec(aboutHistory?.description ?? "");
  const company = {
    legalName: legalMatch ? `${collapse(legalMatch[1]).replace(/S\.A\.C$/, "S.A.C.")}` : "",
    ruc: legalMatch?.[2] ?? /\b(?:10|20)\d{9}\b/.exec(general.get("terms_conditions") ?? "")?.[0] ?? "",
    address: collapse(store?.address ?? general.get("address") ?? "").replace(/\s+,/g, ","),
    notificationEmail: general.get("coorporative_email") || contactEmail,
  };
  if (!company.legalName || !company.ruc) report.add("No se encontró la razón social o el RUC: completarlos en Admin → Contenido → Empresa.");
  report.add(
    `Empresa: ${company.legalName} (RUC ${company.ruc}), dirección de la tienda como domicilio. Los avisos de reclamos llegan a ${company.notificationEmail} (correo corporativo). Confirmar con TWENTY.`,
  );

  // ── Páginas legales ──
  const legalText = (key: string) => htmlToRichText(dropLeadingTitle(general.get(key) ?? ""), { mapLink });

  let privacy = legalText("privacy_policy");
  if (privacy.includes("[Nombre de tu Tienda]")) {
    const replacements: [string, string][] = [
      ["[Nombre de tu Tienda]", "TWENTY"],
      ["[Nombre de la Empresa o Propietario]", `${company.legalName} (RUC ${company.ruc})`],
      ["[Enlace a tu sitio web]", "twentymoda.com"],
      ["[Mercado Pago / Stripe / PayPal / etc.]", "Culqi"],
      ["[DHL, FedEx, Correo local]", "Shalom, Olva y nuestro delivery en Lima"],
      ["[Correo electrónico de soporte, ej: privacidad@tutienda.com]", contactEmail],
    ];
    for (const [from, to] of replacements) privacy = privacy.replaceAll(from, to);
    privacy = privacy
      .split("\n\n")
      // Fecha de la plantilla (la página muestra la fecha real) y la nota y la pregunta que dejó el generador del texto.
      .filter((b) => !/\[Fecha actual\]|^(> )?⚠️ \*\*Nota legal|Shopify o WooCommerce/.test(b))
      .join("\n\n");
    report.add(
      "La política de privacidad publicada era una plantilla genérica con campos sin llenar ([Nombre de tu Tienda], [Fecha actual]…) y la nota del generador. Se completó con los datos de TWENTY y se quitó la nota. Debe revisarla un abogado (Ley 29733 de Protección de Datos Personales).",
    );
  }

  let terms = promoteNumberedHeadings(legalText("terms_conditions")).replace(/S\.AC\b/g, "S.A.C.");
  terms = terms.replace(/^-\s*$/gm, "").replace(/\n{3,}/g, "\n\n");
  if (/WhatsApp:\s*\d{9}/.test(terms)) {
    report.add(`Los términos y condiciones dan otro WhatsApp de contacto (${/WhatsApp:\s*(\d{9})/.exec(terms)![1]}) y un horario de 11:00 a 7:00; la web usa ${general.get("opening_hours")}. Confirmar con TWENTY.`);
  }

  let shipping = legalText("delivery_policy");
  if (/\*\*Zona de Destino/.test(shipping)) {
    shipping = shipping.replace(
      /^\*\*Zona de Destino.*$/m,
      [
        "- **Lima Metropolitana y Callao:** motorizado, **S/ 15.00 (fijo)**, de **1 a 5 días hábiles** tras confirmar el pago. La entrega se coordina contigo por WhatsApp.",
        "- **Provincias (todo el Perú):** empresa Shalom, **pago en destino** (el flete se paga al recoger el paquete en la agencia), de **1 a 4 días hábiles** después del despacho. Retiras el paquete en la oficina de Shalom.",
      ].join("\n"),
    );
    report.add(
      "La tabla de la política de envíos se veía aplastada en un solo párrafo; se reescribió como lista con los mismos datos. Dice delivery Lima S/ 15 fijo, pero el checkout cobra por distrito (Admin → Envíos). Confirmar con TWENTY.",
    );
  }

  const returns = legalText("saleback_policy");
  const legal = Object.fromEntries(
    (
      [
        ["terms", terms],
        ["privacy", privacy],
        ["shipping", shipping],
        ["returns", returns],
      ] as const
    ).map(([key, body]) => [key, { body: body.trim(), updatedAt: null }]),
  );

  // ── Nosotros ──
  let aboutBody = htmlToRichText(aboutHistory?.description, { mapLink });
  let quote = "";
  const blocks = aboutBody.split("\n\n");
  if (blocks.at(-1)?.startsWith("> ")) {
    quote = blocks.pop()!.replace(/^> /gm, "");
    aboutBody = blocks.join("\n\n");
  }
  const section = (correlative: string) => input.aboutuses.find((a) => a.correlative === correlative && isOn(a.visible) && isOn(a.status));
  const plain = (html: string | null | undefined) => htmlToRichText(html).replace(/^NULL$/, "");
  const values = section("section-valores");
  const strengths = input.strengths
    .filter((s) => isOn(s.visible) && isOn(s.status) && s.description)
    .sort((a, b) => Number(a.order_index ?? 0) - Number(b.order_index ?? 0))
    .map((s) => ({ title: collapse(s.name), description: collapse(s.description!), icon: s.image ? `strength/${s.image}` : null }));
  const about = {
    title: collapse(aboutHistory?.title ?? "Nosotros"),
    body: aboutBody,
    image: aboutHistory?.image ? `aboutus/${aboutHistory.image}` : null,
    quote,
    mission: plain(section("section-mision")?.description),
    vision: plain(section("section-vision")?.description),
    strengthsTitle: values ? collapse(values.title ?? values.name) : "",
    strengths,
  };
  const hidden = input.strengths.length - strengths.length;
  if (hidden) report.add(`Nosotros: ${hidden} fortaleza(s) sin publicar o sin texto no se migraron.`);

  // ── Preguntas frecuentes ──
  const faqs = input.faqs
    .filter((f) => isOn(f.status) && f.question.trim() && !/lorem|donec|curabitur/i.test(f.question + f.answer))
    .map((f) => ({ question: collapse(f.question), answer: f.answer.replace(/\r\n?/g, "\n").replace(/\.\.$/, ".").trim() }));
  const skippedFaqs = input.faqs.length - faqs.length;
  if (skippedFaqs) report.add(`Preguntas frecuentes: se omitieron ${skippedFaqs} de relleno ("Donec in pulvinar…") o inactivas.`);

  // ── Blog ──
  const categoryName = new Map(input.blogCategories.map((c) => [c.id, collapse(c.name)]));
  const posts: SeedPost[] = input.posts.map((p) => {
    const body = htmlToRichText(p.description, { mapLink });
    return {
      id: p.id,
      slug: p.slug,
      title: collapse(p.name),
      // Sin resumen guardado: la tienda usa el primer párrafo y se actualiza si se edita el artículo.
      summary: null,
      body,
      image: p.image ? `post/${p.image}` : null,
      category: (p.category_id && categoryName.get(p.category_id)) || null,
      author: p.author ? collapse(p.author) : "TWENTY",
      isPublished: isOn(p.status),
      // Hora de Lima. Si solo hay fecha, mediodía: así no cambia de día por la zona horaria.
      publishedAt:
        p.created_at && p.post_date && p.created_at.startsWith(p.post_date)
          ? new Date(`${p.created_at.replace(" ", "T")}-05:00`)
          : new Date(`${p.post_date ?? "2026-01-01"}T12:00:00-05:00`),
    };
  });
  report.add(
    "Blog: el meta title y la meta description anteriores estaban cortados a mitad de palabra y la URL canónica apuntaba al dominio del proveedor; se generan a partir del título y el primer párrafo.",
  );

  return {
    posts,
    settings: [
      { key: "company", value: company },
      { key: "about", value: about },
      { key: "faqs", value: faqs },
      { key: "legal", value: legal },
    ],
    report: [...report],
  };
}
