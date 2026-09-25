/**
 * Emails de pedidos: quién recibe qué en cada momento.
 *
 * Cliente: confirmación al comprar con Yape/Plin o WhatsApp (con tarjeta, cuando se confirma el pago) y un email
 * por cada avance del pedido (pago confirmado, en preparación, enviado/listo para recoger, entregado, anulado).
 * Los retrocesos (corregir un estado marcado por error) no se avisan.
 * Equipo (admins del panel + el email de avisos de Contenido → Empresa): cada pedido nuevo, cada captura de Yape/Plin
 * que sube un cliente y cada anulación o rechazo. No se avisa al admin que hizo el cambio, ni de los pedidos con
 * tarjeta que nunca se pagaron.
 * Devoluciones de dinero sin anular: al cliente (si el admin no lo desmarca) y al equipo. Si se devuelve al anular,
 * el email de "anulado" ya lo dice.
 */
import { and, eq } from "drizzle-orm";
import type { OrderStatus } from "@/lib/order-status";
import type { Db } from "../db/client";
import { users } from "../db/schema";
import { getSiteSettings, type SiteSettings } from "./content";
import { sendEmail } from "./email";
import { emailBrand, renderBrandedEmail } from "./email-layout";
import { customerOrderEmail, teamOrderEmail, type CustomerEmailKind, type TeamEmailKind } from "./order-emails";
import { getOrderById, type OrderDetail, type StatusChange } from "./orders";
import { getPaymentProofForEmail } from "./payment-proofs";

const PROOF_CID = "captura-pago";

export type OrderEvent =
  | { type: "placed"; orderId: string; paymentMethod: OrderDetail["paymentMethod"] }
  /** `notifyCustomer: false`: el admin desmarcó "Avisar al cliente por email". */
  | { type: "status"; change: StatusChange; notifyCustomer?: boolean }
  /** El cliente subió una captura del pago con Yape/Plin: le llega al equipo con la imagen. */
  | { type: "proof"; orderId: string; proofId: string }
  /** Devolución de dinero confirmada. `userId`: el admin que la hizo (no recibe el aviso del equipo). */
  | { type: "refund"; orderId: string; refundId: string; userId: string | null; notifyCustomer?: boolean };

const FORWARD: Partial<Record<OrderStatus, number>> = { pendiente: 0, por_verificar: 1, pagado: 2, en_preparacion: 3, enviado: 4, entregado: 5 };

export function planOrderEmails(event: OrderEvent): { customer: CustomerEmailKind | null; team: TeamEmailKind | null } {
  if (event.type === "proof") return { customer: null, team: "comprobante" };
  if (event.type === "refund") return { customer: event.notifyCustomer === false ? null : "devolucion", team: "devolucion" };
  if (event.type === "placed") {
    // Con tarjeta todavía no hay nada que confirmar: los emails salen cuando Culqi confirma el pago.
    const card = event.paymentMethod === "tarjeta";
    return { customer: card ? null : "recibido", team: card ? null : "nuevo" };
  }
  const { from, to, changedBy, paymentMethod } = event.change;
  const plan = ((): { customer: CustomerEmailKind | null; team: TeamEmailKind | null } => {
    const automatic = changedBy === null;
    switch (to) {
      case "anulado":
        // Solo la tienda anula sola, y solo los pedidos con tarjeta sin pagar a los 60 minutos: el equipo nunca los vio.
        if (automatic && from === "pendiente" && paymentMethod === "tarjeta") return { customer: "expirado", team: null };
        return { customer: "anulado", team: "anulado" };
      case "rechazado":
        return { customer: "rechazado", team: "rechazado" };
      case "pendiente":
        return { customer: null, team: null };
      default: {
        const forward = (FORWARD[to] ?? 0) > (FORWARD[from] ?? 0);
        // Pago con Culqi (sin admin de por medio): para el equipo es el pedido nuevo. La captura de Yape/Plin se avisa
        // aparte (evento "proof", con la imagen), también cuando el cliente sube otra.
        const team = to === "pagado" && automatic && paymentMethod === "tarjeta" ? "nuevo" : null;
        return { customer: forward ? to : null, team };
      }
    }
  })();
  return event.notifyCustomer === false ? { ...plan, customer: null } : plan;
}

/** Admins activos del panel + el email de avisos (o el de contacto), sin repetir y sin quien hizo el cambio. */
export async function teamRecipients(db: Db, settings: SiteSettings, excludeUserId: string | null = null): Promise<string[]> {
  const admins = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(and(eq(users.role, "admin"), eq(users.isActive, true)));
  const actor = admins.find((a) => a.id === excludeUserId)?.email.toLowerCase();
  const all = [...admins.map((a) => a.email), settings.company.notificationEmail || settings.contact.email].map((e) => e.trim().toLowerCase());
  return [...new Set(all)].filter((e) => e.includes("@") && e !== actor);
}

/** Manda los emails de un evento. `baseUrl`: dominio de los enlaces y del logo (ver appUrl). */
export async function notifyOrderEvent(db: Db, event: OrderEvent, baseUrl: string): Promise<void> {
  const plan = planOrderEmails(event);
  if (!plan.customer && !plan.team) return;
  const orderId = event.type === "status" ? event.change.orderId : event.orderId;
  const [order, settings, proof] = await Promise.all([
    getOrderById(db, orderId),
    getSiteSettings(db),
    event.type === "proof" ? getPaymentProofForEmail(db, event.proofId) : null,
  ]);
  if (!order) return;

  const brand = emailBrand(settings, baseUrl);
  const ctx = { settings, baseUrl };
  const history = event.type === "status" ? order.history.find((h) => h.id === event.change.historyId) : undefined;
  const refund = event.type === "refund" ? order.refunds.find((r) => r.id === event.refundId && r.status === "hecha") : undefined;
  if (event.type === "refund" && !refund) return;
  // Si la acción se reintenta, Resend no repite el email (misma clave durante 24 h).
  const key =
    event.type === "placed"
      ? `pedido-${order.id}-creado`
      : event.type === "proof"
        ? `pedido-${order.id}-captura-${event.proofId}`
        : event.type === "refund"
          ? `pedido-${order.id}-devolucion-${event.refundId}`
          : `pedido-${order.id}-${event.change.historyId}`;
  const actor = event.type === "status" ? event.change.changedBy : event.type === "refund" ? event.userId : null;
  const tasks: Promise<unknown>[] = [];

  if (plan.customer) {
    const email = customerOrderEmail(plan.customer, order, ctx, history?.customerMessage, refund);
    tasks.push(
      sendEmail({
        tag: `pedido-${plan.customer}`,
        to: order.email,
        subject: email.subject,
        ...renderBrandedEmail(email.content, brand),
        replyTo: settings.contact.email || settings.company.notificationEmail || undefined,
        idempotencyKey: `${key}-cliente`,
      }),
    );
  }
  if (plan.team) {
    const to = await teamRecipients(db, settings, actor);
    if (to.length) {
      const change = event.type === "status" ? { by: history?.changedByName ?? null, note: history?.note ?? null, restocked: event.change.restocked } : undefined;
      // La captura va dentro del email (cid) y adjunta, para verla sin entrar al panel y poder guardarla.
      const filename = `captura-pedido-${order.number}${proof && proof.nth > 1 ? `-${proof.nth}` : ""}.jpg`;
      const email = teamOrderEmail(plan.team, order, ctx, change, proof ? { src: `cid:${PROOF_CID}`, nth: proof.nth } : undefined, refund);
      tasks.push(
        sendEmail({
          tag: `equipo-${plan.team}`,
          to,
          subject: email.subject,
          ...renderBrandedEmail(email.content, brand),
          replyTo: order.email,
          attachments: proof ? [{ filename, content: proof.jpeg, contentType: "image/jpeg", contentId: PROOF_CID }] : undefined,
          idempotencyKey: `${key}-equipo`,
        }),
      );
    }
  }
  for (const result of await Promise.allSettled(tasks)) {
    if (result.status === "rejected") console.error("[email]", result.reason instanceof Error ? result.reason.message : "error al enviar");
  }
}
