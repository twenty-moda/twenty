/**
 * Envío de emails con Resend (API HTTP, sin SDK). Sin RESEND_API_KEY o EMAIL_FROM no se envía nada:
 * en desarrollo solo se avisa en consola, sin datos del destinatario.
 */
/** `tag` identifica el tipo de email en los logs (nunca se registra el asunto ni el destinatario: tienen datos personales). */
export type Email = { tag: string; to: string; subject: string; html: string; text: string; replyTo?: string };

export function emailConfigured(): boolean {
  return !!(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

export async function sendEmail(email: Email): Promise<{ sent: boolean }> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!key || !from) {
    console.info(`[email] No configurado (RESEND_API_KEY / EMAIL_FROM): no se envió el email "${email.tag}".`);
    return { sent: false };
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [email.to], subject: email.subject, html: email.html, text: email.text, reply_to: email.replyTo }),
  });
  if (!res.ok) throw new Error(`Resend respondió ${res.status} al enviar el email "${email.tag}"`);
  return { sent: true };
}

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (c) => ESCAPES[c]);

/** Email simple con la marca: título, filas "etiqueta: valor" y párrafos. Devuelve HTML y texto plano. */
export function renderEmail({ title, intro, rows = [], outro = [] }: { title: string; intro: string[]; rows?: [string, string][]; outro?: string[] }) {
  const p = (t: string) => `<p style="margin:0 0 12px;line-height:1.5">${escapeHtml(t).replace(/\n/g, "<br>")}</p>`;
  const html = [
    `<div style="font-family:Arial,Helvetica,sans-serif;color:#111;max-width:560px;margin:0 auto;padding:24px">`,
    `<p style="margin:0 0 24px;font-weight:800;letter-spacing:4px">TWENTY</p>`,
    `<h1 style="font-size:20px;margin:0 0 16px">${escapeHtml(title)}</h1>`,
    ...intro.map(p),
    rows.length
      ? `<table style="width:100%;border-collapse:collapse;margin:16px 0">${rows
          .map(
            ([k, v]) =>
              `<tr><td style="padding:6px 8px 6px 0;color:#666;vertical-align:top;white-space:nowrap">${escapeHtml(k)}</td><td style="padding:6px 0">${escapeHtml(v).replace(/\n/g, "<br>")}</td></tr>`,
          )
          .join("")}</table>`
      : "",
    ...outro.map(p),
    `</div>`,
  ].join("");
  const text = [title, "", ...intro, "", ...rows.map(([k, v]) => `${k}: ${v}`), "", ...outro].join("\n");
  return { html, text };
}
