/**
 * Envío de emails con Resend (API HTTP, sin SDK). Sin RESEND_API_KEY o EMAIL_FROM no se envía nada:
 * en desarrollo solo se avisa en consola, sin datos del destinatario.
 * El remitente (EMAIL_FROM, p. ej. "TWENTY <pedidos@twentymoda.com>") tiene que ser de un dominio verificado en Resend.
 */
/** `tag` identifica el tipo de email en los logs (nunca se registra el asunto ni el destinatario: tienen datos personales). */
export type EmailAttachment = {
  filename: string;
  content: Buffer;
  contentType?: string;
  /** Con id, la imagen se puede mostrar dentro del email con <img src="cid:id">. */
  contentId?: string;
};

export type Email = {
  tag: string;
  to: string | string[];
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  attachments?: EmailAttachment[];
  /** Resend no repite un envío con la misma clave en 24 h (por si una acción se reintenta). */
  idempotencyKey?: string;
};

export function emailConfigured(): boolean {
  return !!(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

const MAX_ATTEMPTS = 3;

export async function sendEmail(email: Email): Promise<{ sent: boolean }> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  const to = (Array.isArray(email.to) ? email.to : [email.to]).filter(Boolean);
  if (!key || !from) {
    console.info(`[email] No configurado (RESEND_API_KEY / EMAIL_FROM): no se envió el email "${email.tag}".`);
    return { sent: false };
  }
  if (!to.length) return { sent: false };

  const attachments = email.attachments?.map((a) => ({
    filename: a.filename,
    content: a.content.toString("base64"),
    content_type: a.contentType,
    content_id: a.contentId,
  }));
  const body = JSON.stringify({ from, to, subject: email.subject, html: email.html, text: email.text, reply_to: email.replyTo, attachments });
  for (let attempt = 1; ; attempt++) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        ...(email.idempotencyKey ? { "Idempotency-Key": email.idempotencyKey } : {}),
      },
      body,
      signal: AbortSignal.timeout(15_000),
    });
    if (res.ok) return { sent: true };
    // 429: se superó el límite de envíos por segundo. 5xx: falla de Resend. Se reintenta con una pausa corta.
    if ((res.status === 429 || res.status >= 500) && attempt < MAX_ATTEMPTS) {
      const wait = Math.min(Number(res.headers.get("retry-after")) || attempt, 5);
      await new Promise((resolve) => setTimeout(resolve, wait * 1000));
      continue;
    }
    // El motivo sirve para el log ("domain is not verified"), pero sin direcciones de email.
    const detail = await res
      .json()
      .then((b: { message?: string }) => b.message?.replace(/[^\s()<>@]+@[^\s()<>]+/g, "<email>"))
      .catch(() => null);
    throw new Error(`Resend respondió ${res.status} al enviar el email "${email.tag}"${detail ? `: ${detail}` : ""}`);
  }
}

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (c) => ESCAPES[c]);
