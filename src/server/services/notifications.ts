/** Emails que salen de los formularios públicos (constancia de reclamo, respuesta y avisos al equipo). */
import { appUrl } from "@/lib/links";
import { formatPrice } from "@/lib/money";
import { DOCUMENT_LABEL } from "@/lib/order-status";
import { COMPLAINT_TYPES } from "@/lib/public-forms";
import { complaintCode, complaintDeadline, type Complaint } from "./complaints";
import type { SiteSettings } from "./content";
import { sendEmail } from "./email";
import { emailBrand, renderBrandedEmail } from "./email-layout";

type Settings = Pick<SiteSettings, "company" | "contact" | "socials">;

const dayFormat = new Intl.DateTimeFormat("es-PE", { timeZone: "UTC", day: "2-digit", month: "long", year: "numeric" });
const dateTimeFormat = new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", dateStyle: "long", timeStyle: "short" });

/** Todas las filas de la hoja de reclamación (constancia, email y admin usan las mismas). */
export function complaintRows(c: Complaint, company: SiteSettings["company"]): [string, string][] {
  return [
    ["Hoja N°", complaintCode(c)],
    ["Fecha", dateTimeFormat.format(c.createdAt)],
    ["Proveedor", [company.legalName, company.ruc && `RUC ${company.ruc}`, company.address].filter(Boolean).join(" · ")],
    ["Tipo", COMPLAINT_TYPES[c.type].label],
    ["Consumidor", c.name],
    ["Documento", `${DOCUMENT_LABEL[c.documentType]} ${c.documentNumber}`],
    ["Teléfono", c.phone],
    ["Email", c.email],
    ["Domicilio", [c.address, c.district, c.province, c.department].filter(Boolean).join(", ")],
    ...(c.isMinor ? ([["Padre, madre o apoderado", `${c.guardianName} (${c.guardianDocument})`]] as [string, string][]) : []),
    ["Bien contratado", `${c.itemType === "producto" ? "Producto" : "Servicio"}: ${c.itemDescription}`],
    ...(c.amountCents !== null ? ([["Monto reclamado", formatPrice(c.amountCents)]] as [string, string][]) : []),
    ...(c.orderNumber ? ([["N° de pedido", c.orderNumber]] as [string, string][]) : []),
    ...(c.incidentDate ? ([["Fecha del hecho", dayFormat.format(new Date(`${c.incidentDate}T00:00:00Z`))]] as [string, string][]) : []),
    ["Detalle", c.detail],
    ["Pedido del consumidor", c.request],
  ];
}

const teamInbox = (settings: Settings) => settings.company.notificationEmail || settings.contact.email;
/** Adonde llega lo que el cliente conteste a una respuesta del equipo (como en los emails de pedidos). */
export const contactReplyTo = (settings: Settings) => settings.contact.email || settings.company.notificationEmail;

export async function sendComplaintEmails(c: Complaint, settings: Settings, links: { constancia: string; admin: string }) {
  const code = complaintCode(c);
  const kind = COMPLAINT_TYPES[c.type].label.toLowerCase();
  const deadline = dayFormat.format(complaintDeadline(c));
  const rows = complaintRows(c, settings.company);
  const brand = emailBrand(settings, appUrl());
  const tasks: Promise<unknown>[] = [];

  const toConsumer = renderBrandedEmail(
    {
      preheader: `Te responderemos a más tardar el ${deadline}.`,
      eyebrow: `Libro de Reclamaciones · ${code}`,
      title: `Recibimos tu ${kind}`,
      blocks: [
        { type: "text", text: `Hola ${c.name.split(" ")[0]}, esta es la constancia de tu hoja de reclamación en el Libro de Reclamaciones virtual de TWENTY.` },
        { type: "text", text: `Te responderemos a este correo a más tardar el ${deadline} (15 días hábiles).`, strong: true },
        { type: "button", label: "Ver e imprimir constancia", url: links.constancia },
        { type: "box", title: "Hoja de reclamación", blocks: [{ type: "rows", rows }] },
        {
          type: "text",
          small: true,
          muted: true,
          text: "La formulación del reclamo no impide acudir a otras vías de solución de controversias ni es requisito previo para interponer una denuncia ante el INDECOPI.",
        },
      ],
    },
    brand,
  );
  tasks.push(sendEmail({ tag: "reclamo-constancia", to: c.email, subject: `Hoja de reclamación ${code}`, ...toConsumer, replyTo: teamInbox(settings) || undefined }));

  const team = teamInbox(settings);
  if (team) {
    const toTeam = renderBrandedEmail(
      {
        audience: "team",
        tone: "danger",
        preheader: `Hay que responderlo a más tardar el ${deadline}.`,
        eyebrow: `Libro de Reclamaciones · ${code}`,
        title: `Nuevo ${kind}`,
        blocks: [
          { type: "text", text: `${c.name} registró un ${kind}. Hay que responderlo a más tardar el ${deadline} (15 días hábiles).`, strong: true },
          { type: "button", label: "Responder en el panel", url: links.admin },
          { type: "box", title: "Hoja de reclamación", blocks: [{ type: "rows", rows }] },
        ],
      },
      brand,
    );
    tasks.push(sendEmail({ tag: "reclamo-aviso-equipo", to: team, subject: `Libro de Reclamaciones: ${code} (${c.name})`, ...toTeam, replyTo: c.email }));
  }
  for (const result of await Promise.allSettled(tasks)) {
    if (result.status === "rejected") console.error("[email]", result.reason instanceof Error ? result.reason.message : "error al enviar");
  }
}

export async function sendComplaintResponse(c: Complaint, settings: Settings) {
  const code = complaintCode(c);
  const email = renderBrandedEmail(
    {
      preheader: `Respuesta de ${settings.company.legalName || "TWENTY"} a tu hoja ${code}.`,
      eyebrow: `Libro de Reclamaciones · ${code}`,
      title: "Respuesta a tu reclamo",
      blocks: [
        { type: "text", text: `Hola ${c.name.split(" ")[0]}, esta es la respuesta de ${settings.company.legalName || "TWENTY"} a tu hoja de reclamación.` },
        { type: "box", title: "Respuesta", blocks: [{ type: "text", text: c.response ?? "" }] },
        { type: "rows", title: "Tu reclamo", rows: [["Hoja N°", code], ["Detalle", c.detail]] },
        { type: "text", text: "Si tienes dudas, responde a este correo.", muted: true },
      ],
    },
    emailBrand(settings, appUrl()),
  );
  return sendEmail({ tag: "reclamo-respuesta", to: c.email, subject: `Respuesta a tu hoja de reclamación ${code}`, ...email, replyTo: teamInbox(settings) || undefined });
}

export async function sendContactNotification(message: { name: string; email: string; phone: string | null; message: string }, settings: Settings, adminLink: string) {
  const team = teamInbox(settings);
  if (!team) return { sent: false };
  const email = renderBrandedEmail(
    {
      audience: "team",
      preheader: message.message.slice(0, 120),
      eyebrow: "Formulario de contacto",
      title: `Mensaje de ${message.name}`,
      blocks: [
        { type: "box", blocks: [{ type: "text", text: message.message }] },
        {
          type: "rows",
          rows: [["Nombre", message.name], ["Email", message.email], ...(message.phone ? ([["Teléfono", message.phone]] as [string, string][]) : [])],
        },
        { type: "text", text: "Responde este correo para contestarle directamente.", muted: true, small: true },
        { type: "button", label: "Ver en el panel", url: adminLink, secondary: true },
      ],
    },
    emailBrand(settings, appUrl()),
  );
  return sendEmail({ tag: "contacto-aviso-equipo", to: team, subject: `Contacto web: ${message.name}`, ...email, replyTo: message.email });
}

/** Respuesta del equipo a un mensaje de contacto. Si el cliente contesta, le llega al buzón del equipo (replyTo). */
export async function sendContactReply(message: { name: string; email: string; message: string }, body: string, settings: Settings) {
  const email = renderBrandedEmail(
    {
      preheader: body.slice(0, 120),
      eyebrow: "Tu mensaje a TWENTY",
      title: `Hola, ${message.name.trim().split(/\s+/)[0]}`,
      blocks: [
        { type: "text", text: body },
        { type: "text", text: "Si tienes más dudas, responde este correo.", muted: true, small: true },
        { type: "box", title: "Tu mensaje", blocks: [{ type: "text", text: message.message, muted: true, small: true }] },
      ],
    },
    emailBrand(settings, appUrl()),
  );
  return sendEmail({
    tag: "contacto-respuesta",
    to: message.email,
    subject: "Respuesta a tu mensaje · TWENTY",
    ...email,
    replyTo: contactReplyTo(settings) || undefined,
  });
}
