/** Emails que salen de los formularios públicos (constancia de reclamo, respuesta y avisos al equipo). */
import { formatPrice } from "@/lib/money";
import { COMPLAINT_TYPES } from "@/lib/public-forms";
import { complaintCode, complaintDeadline, type Complaint } from "./complaints";
import type { SiteSettings } from "./content";
import { renderEmail, sendEmail } from "./email";

const dayFormat = new Intl.DateTimeFormat("es-PE", { timeZone: "UTC", day: "2-digit", month: "long", year: "numeric" });
const dateTimeFormat = new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", dateStyle: "long", timeStyle: "short" });
const DOCS: Record<Complaint["documentType"], string> = { dni: "DNI", ce: "C.E.", pasaporte: "Pasaporte", ruc: "RUC" };

/** Todas las filas de la hoja de reclamación (constancia, email y admin usan las mismas). */
export function complaintRows(c: Complaint, company: SiteSettings["company"]): [string, string][] {
  return [
    ["Hoja N°", complaintCode(c)],
    ["Fecha", dateTimeFormat.format(c.createdAt)],
    ["Proveedor", [company.legalName, company.ruc && `RUC ${company.ruc}`, company.address].filter(Boolean).join(" · ")],
    ["Tipo", COMPLAINT_TYPES[c.type].label],
    ["Consumidor", c.name],
    ["Documento", `${DOCS[c.documentType]} ${c.documentNumber}`],
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

export async function sendComplaintEmails(c: Complaint, settings: Pick<SiteSettings, "company" | "contact">, links: { constancia: string; admin: string }) {
  const code = complaintCode(c);
  const deadline = dayFormat.format(complaintDeadline(c));
  const rows = complaintRows(c, settings.company);
  const tasks: Promise<unknown>[] = [];

  const toConsumer = renderEmail({
    title: `Recibimos tu ${COMPLAINT_TYPES[c.type].label.toLowerCase()} ${code}`,
    intro: [
      `Hola ${c.name.split(" ")[0]}, esta es la constancia de tu hoja de reclamación en el Libro de Reclamaciones virtual de TWENTY.`,
      `Te responderemos a este correo a más tardar el ${deadline} (15 días hábiles).`,
    ],
    rows,
    outro: [
      `Puedes ver e imprimir tu constancia aquí: ${links.constancia}`,
      "La formulación del reclamo no impide acudir a otras vías de solución de controversias ni es requisito previo para interponer una denuncia ante el INDECOPI.",
    ],
  });
  tasks.push(sendEmail({ tag: "reclamo-constancia", to: c.email, subject: `TWENTY · Hoja de reclamación ${code}`, ...toConsumer, replyTo: settings.company.notificationEmail || undefined }));

  const team = settings.company.notificationEmail || settings.contact.email;
  if (team) {
    const toTeam = renderEmail({
      title: `Nuevo ${COMPLAINT_TYPES[c.type].label.toLowerCase()} ${code}`,
      intro: [`Hay que responderlo a más tardar el ${deadline}.`, `Respóndelo desde el panel: ${links.admin}`],
      rows,
    });
    tasks.push(sendEmail({ tag: "reclamo-aviso-equipo", to: team, subject: `Libro de Reclamaciones: ${code} (${c.name})`, ...toTeam, replyTo: c.email }));
  }
  for (const result of await Promise.allSettled(tasks)) {
    if (result.status === "rejected") console.error("[email]", result.reason instanceof Error ? result.reason.message : "error al enviar");
  }
}

export async function sendComplaintResponse(c: Complaint, settings: Pick<SiteSettings, "company">) {
  const code = complaintCode(c);
  const email = renderEmail({
    title: `Respuesta a tu ${COMPLAINT_TYPES[c.type].label.toLowerCase()} ${code}`,
    intro: [`Hola ${c.name.split(" ")[0]}, esta es la respuesta de ${settings.company.legalName || "TWENTY"} a tu hoja de reclamación.`],
    rows: [
      ["Hoja N°", code],
      ["Tu reclamo", c.detail],
      ["Respuesta", c.response ?? ""],
    ],
    outro: ["Si tienes dudas, responde a este correo."],
  });
  return sendEmail({ tag: "reclamo-respuesta", to: c.email, subject: `TWENTY · Respuesta a tu hoja de reclamación ${code}`, ...email, replyTo: settings.company.notificationEmail || undefined });
}

export async function sendContactNotification(
  message: { name: string; email: string; phone: string | null; message: string },
  settings: Pick<SiteSettings, "company" | "contact">,
  adminLink: string,
) {
  const team = settings.company.notificationEmail || settings.contact.email;
  if (!team) return { sent: false };
  const email = renderEmail({
    title: `Nuevo mensaje de ${message.name}`,
    intro: ["Llegó un mensaje desde el formulario de contacto de la web.", `Míralo en el panel: ${adminLink}`],
    rows: [
      ["Nombre", message.name],
      ["Email", message.email],
      ...(message.phone ? ([["Teléfono", message.phone]] as [string, string][]) : []),
      ["Mensaje", message.message],
    ],
  });
  return sendEmail({ tag: "contacto-aviso-equipo", to: team, subject: `Contacto web: ${message.name}`, ...email, replyTo: message.email });
}
