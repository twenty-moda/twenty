/**
 * Contenido de los emails de pedidos: al cliente (confirmación y cada cambio de estado) y al equipo (pedido nuevo,
 * anulado o rechazado). Solo arma el contenido; quién recibe qué lo decide order-notifications.ts.
 */
import { whatsappUrl } from "@/lib/links";
import { formatPrice } from "@/lib/money";
import { DOCUMENT_LABEL, formatOrderNumber, ORDER_PROGRESS, PAYMENT_METHOD_LABEL, progressIndex, type OrderStatus } from "@/lib/order-status";
import { groupOrderItems } from "@/lib/outfits";
import type { SiteSettings } from "./content";
import type { EmailBlock, EmailContent } from "./email-layout";
import type { OrderDetail } from "./orders";

export type CustomerEmailKind = "recibido" | "por_verificar" | "pagado" | "en_preparacion" | "enviado" | "entregado" | "anulado" | "expirado" | "rechazado";
export type TeamEmailKind = "nuevo" | "comprobante" | "anulado" | "rechazado";

export type OrderEmail = { subject: string; content: EmailContent };
type Ctx = { settings: SiteSettings; baseUrl: string };

const firstName = (order: OrderDetail) => order.customerName.trim().split(/\s+/)[0];
const units = (order: OrderDetail) => order.items.reduce((sum, i) => sum + i.quantity, 0);
/** Los celulares se guardan con 9 dígitos (sin el 51). */
const customerWhatsapp = (phone: string) => (phone.replace(/\D/g, "").length === 9 ? `51${phone}` : phone);

function totalsBlock(order: OrderDetail): EmailBlock {
  return {
    type: "totals",
    rows: [
      { label: "Subtotal", value: formatPrice(order.subtotalCents) },
      ...order.promotions.map((p) => ({ label: `Promo ${p.name}`, value: `-${formatPrice(p.discountCents)}`, accent: true })),
      { label: "Envío", value: order.shippingCents ? formatPrice(order.shippingCents) : order.paymentOnDelivery ? "Pagas al recoger" : "Gratis" },
      { label: "Total", value: formatPrice(order.totalCents), strong: true },
    ],
  };
}

/** Prendas del pedido. Un conjunto va en un solo renglón con cada pieza (y su SKU para el equipo) debajo. */
function itemsBlock(order: OrderDetail, withSku = false): EmailBlock {
  return {
    type: "items",
    items: groupOrderItems(order.items).map((group) =>
      group.kind === "single"
        ? {
            name: group.item.productName,
            detail: [withSku && group.item.sku, group.item.colorName, `Talla ${group.item.sizeLabel}`, `x${group.item.quantity}`].filter(Boolean).join(" · "),
            price: formatPrice(group.item.totalCents),
            image: group.item.image,
          }
        : {
            name: group.name,
            detail: [
              ...group.items.map((i) => `${i.productName}: ${[withSku && i.sku, i.colorName, `talla ${i.sizeLabel}`].filter(Boolean).join(" · ")}`),
              `Conjunto · x${group.quantity}`,
            ].join("\n"),
            price: formatPrice(group.totalCents),
            image: group.items[0].image,
          },
    ),
  };
}

function deliveryRows(order: OrderDetail, settings: SiteSettings, forTeam = false): [string, string][] {
  const rows: [string, string][] = [["Forma de entrega", order.shippingMethodName]];
  if (order.shippingKind === "lima_delivery") {
    rows.push(["Dirección", `${order.address}, ${order.district}${order.addressReference ? ` (${order.addressReference})` : ""}`]);
  } else if (order.shippingKind === "agency") {
    rows.push([forTeam ? "Agencia de destino" : "Recoges en", `${order.agencyName} · ${order.district}, ${order.department}`]);
  } else if (settings.store) {
    rows.push(["Tienda", settings.store.address]);
    if (settings.contact.openingHours) rows.push(["Horario", settings.contact.openingHours]);
  }
  rows.push([forTeam ? "Recibe" : "A nombre de", `${order.customerName} · ${order.phone}`]);
  if (forTeam && order.shippingKind === "agency") rows.push(["Documento para recoger", `${DOCUMENT_LABEL[order.documentType]} ${order.documentNumber}`]);
  return rows;
}

/** Guía del courier (Shalom), si el equipo ya la anotó. */
function trackingBox(order: OrderDetail): EmailBlock[] {
  if (!order.trackingNumber || !order.trackingCode) return [];
  return [
    {
      type: "box",
      title: "Seguimiento",
      blocks: [
        { type: "rows", rows: [["N° de orden", order.trackingNumber], ["Código", order.trackingCode]] },
        { type: "text", text: "Mira en qué va tu envío en la página de tu pedido.", small: true, muted: true },
      ],
    },
  ];
}

const summaryBox = (order: OrderDetail): EmailBlock => ({ type: "box", title: `Tu compra (${units(order)})`, blocks: [itemsBlock(order), totalsBlock(order)] });
const deliveryBox = (order: OrderDetail, settings: SiteSettings): EmailBlock => ({ type: "box", title: "Entrega", blocks: [{ type: "rows", rows: deliveryRows(order, settings) }] });
const progressBlock = (status: OrderStatus): EmailBlock => ({ type: "progress", steps: ORDER_PROGRESS.map((p) => p.label), current: progressIndex(status) });

// ─── Cliente ─────────────────────────────────────────────────────────────────

/** `message`: lo que el equipo escribió para el cliente al cambiar el estado (p. ej. la clave de Shalom). */
export function customerOrderEmail(kind: CustomerEmailKind, order: OrderDetail, { settings, baseUrl }: Ctx, message?: string | null): OrderEmail {
  const number = formatOrderNumber(order.number);
  const total = formatPrice(order.totalCents);
  const name = firstName(order);
  const whatsapp = settings.contact.whatsapp;
  const orderButton = (secondary = false): EmailBlock => ({ type: "button", label: "Ver mi pedido", url: `${baseUrl}/pedido/${order.id}`, secondary });
  const whatsappButton = (text: string, label = "Escribir por WhatsApp", secondary = false): EmailBlock[] =>
    whatsapp ? [{ type: "button", label, url: whatsappUrl(whatsapp, text), secondary }] : [];
  const messageBox: EmailBlock[] = message ? [{ type: "box", title: "Mensaje de TWENTY", blocks: [{ type: "text", text: message }] }] : [];
  const pickup = order.shippingKind === "store_pickup";
  const doc = `${DOCUMENT_LABEL[order.documentType]} ${order.documentNumber}`;

  const make = (subject: string, preheader: string, title: string, blocks: EmailBlock[], tone: EmailContent["tone"] = "default"): OrderEmail => ({
    subject,
    content: { preheader, eyebrow: `Pedido ${number}`, title, tone, blocks },
  });

  switch (kind) {
    case "recibido":
      if (order.paymentMethod === "yape_plin") {
        const { walletQr, walletName, walletDescription } = settings.payments;
        return make(`Recibimos tu pedido ${number}: falta tu pago`, `Paga ${total} con Yape o Plin y sube la captura en la página de tu pedido.`, `¡Gracias, ${name}!`, [
          { type: "text", text: `Recibimos tu pedido ${number}. Para confirmarlo, paga ${total} con Yape o Plin y sube la captura del pago en la página de tu pedido. Te guardamos las prendas mientras tanto.` },
          progressBlock(order.status),
          {
            type: "box",
            title: `Paga ${total} con Yape o Plin`,
            blocks: [
              ...(walletQr ? [{ type: "image", src: walletQr, alt: "Código QR para pagar con Yape o Plin", width: 200 } as const] : []),
              ...(walletName ? [{ type: "text", text: walletName, strong: true, small: true } as const] : []),
              ...(walletDescription ? [{ type: "text", text: walletDescription, muted: true, small: true } as const] : []),
              { type: "steps", items: ["Escanea el QR desde tu app de Yape o Plin.", `Paga exactamente ${total}.`, "Sube la captura del pago en la página de tu pedido."] },
              { type: "button", label: "Subir captura del pago", url: `${baseUrl}/pedido/${order.id}` },
              ...whatsappButton(`Hola TWENTY, pagué mi pedido ${number} por ${total}. Les envío la captura.`, "O envíala por WhatsApp", true),
            ],
          },
          summaryBox(order),
          deliveryBox(order, settings),
        ]);
      }
      return make(`Recibimos tu pedido ${number}`, `Te escribiremos por WhatsApp para coordinar el pago de ${total}.`, `¡Gracias, ${name}!`, [
        { type: "text", text: `Recibimos tu pedido ${number} por ${total}. Te escribiremos por WhatsApp al ${order.phone} para coordinar el pago. Si prefieres, escríbenos tú ahora.` },
        progressBlock(order.status),
        ...whatsappButton(`Hola TWENTY, quiero coordinar el pago de mi pedido ${number} (${total}).`),
        orderButton(true),
        summaryBox(order),
        deliveryBox(order, settings),
      ]);

    case "por_verificar":
      return make(`Estamos verificando tu pago · Pedido ${number}`, "Te avisaremos apenas confirmemos el pago.", "Estamos verificando tu pago", [
        { type: "text", text: `Hola ${name}, recibimos el comprobante de tu pedido ${number}. Te avisaremos apenas confirmemos el pago.` },
        progressBlock(order.status),
        ...messageBox,
        orderButton(),
        summaryBox(order),
      ]);

    case "pagado":
      return make(`Pago confirmado · Pedido ${number}`, `Recibimos tu pago de ${total}. Ya estamos con tu pedido.`, "¡Pago confirmado!", [
        {
          type: "text",
          text: `Hola ${name}, recibimos tu pago de ${total} por el pedido ${number}. ${pickup ? "Te avisaremos cuando esté listo para recoger." : "Ya lo estamos preparando: te avisaremos cuando salga."}`,
        },
        progressBlock(order.status),
        ...messageBox,
        orderButton(),
        summaryBox(order),
        deliveryBox(order, settings),
      ]);

    case "en_preparacion":
      return make(`Estamos preparando tu pedido ${number}`, pickup ? "Te avisaremos cuando puedas recogerlo." : "Te avisaremos cuando salga.", "Estamos preparando tu pedido", [
        { type: "text", text: `Hola ${name}, tu pedido ${number} ya está en preparación. ${pickup ? "Te avisaremos cuando puedas recogerlo." : "Te avisaremos cuando salga."}` },
        progressBlock(order.status),
        ...messageBox,
        orderButton(),
        summaryBox(order),
      ]);

    case "enviado": {
      if (pickup) {
        const store = settings.store?.address;
        return make(`Tu pedido ${number} está listo para recoger`, store ? `Recógelo en ${store}.` : "Ya puedes recogerlo en la tienda.", "Tu pedido está listo", [
          {
            type: "text",
            text: `Hola ${name}, ya puedes recoger tu pedido ${number} en nuestra tienda${store ? `: ${store}` : ""}.${settings.contact.openingHours ? ` Horario: ${settings.contact.openingHours}.` : ""} Lleva tu ${doc}.`,
          },
          progressBlock(order.status),
          ...messageBox,
          orderButton(),
          summaryBox(order),
        ]);
      }
      if (order.shippingKind === "agency") {
        return make(`Tu pedido ${number} fue enviado`, `Va a la agencia ${order.agencyName}. Recógelo con tu ${doc}.`, "Tu pedido fue enviado", [
          {
            type: "text",
            text: `Hola ${name}, enviamos tu pedido ${number} por ${order.shippingMethodName} a la agencia ${order.agencyName} (${order.district}). Cuando llegue, recógelo con tu ${doc}.${order.paymentOnDelivery ? " El envío se paga al recoger." : ""}`,
          },
          progressBlock(order.status),
          ...messageBox,
          ...trackingBox(order),
          orderButton(),
          summaryBox(order),
          deliveryBox(order, settings),
        ]);
      }
      return make(`Tu pedido ${number} va en camino`, `Sale hacia ${order.district}.`, "Tu pedido va en camino", [
        { type: "text", text: `Hola ${name}, tu pedido ${number} salió hacia ${order.address}, ${order.district}. Si hace falta coordinar la entrega, te llamaremos al ${order.phone}.` },
        progressBlock(order.status),
        ...messageBox,
        orderButton(),
        summaryBox(order),
        deliveryBox(order, settings),
      ]);
    }

    case "entregado":
      return make(`Tu pedido ${number} fue entregado`, "Gracias por comprar en TWENTY.", "¡Pedido entregado!", [
        { type: "text", text: `Hola ${name}, tu pedido ${number} fue entregado. Gracias por comprar en TWENTY: esperamos que lo disfrutes.` },
        progressBlock(order.status),
        ...messageBox,
        { type: "text", text: "¿Necesitas otra talla? Revisa nuestra política de cambios y escríbenos.", muted: true },
        { type: "button", label: "Seguir comprando", url: `${baseUrl}/catalogo` },
        { type: "button", label: "Política de cambios", url: `${baseUrl}/politicas-de-devolucion-y-cambio`, secondary: true },
        summaryBox(order),
      ]);

    case "anulado":
      return make(
        `Tu pedido ${number} fue anulado`,
        "Si ya pagaste o crees que es un error, escríbenos.",
        "Pedido anulado",
        [
          { type: "text", text: `Hola ${name}, anulamos tu pedido ${number}. Si ya pagaste o crees que es un error, escríbenos y lo resolvemos.` },
          ...messageBox,
          ...whatsappButton(`Hola TWENTY, tengo una consulta sobre mi pedido ${number}, que fue anulado.`),
          summaryBox(order),
        ],
        "danger",
      );

    case "expirado":
      return make(
        `Tu pedido ${number} se anuló: no recibimos el pago`,
        "Si todavía quieres tus prendas, puedes volver a comprarlas.",
        "Tu pedido se anuló",
        [
          { type: "text", text: `Hola ${name}, no recibimos el pago con tarjeta de tu pedido ${number}, así que lo anulamos y liberamos las prendas.` },
          { type: "text", text: "Si todavía las quieres, vuelve a comprarlas mientras haya stock. Si tuviste algún problema para pagar, escríbenos y te ayudamos." },
          { type: "button", label: "Volver a la tienda", url: `${baseUrl}/catalogo` },
          ...whatsappButton(`Hola TWENTY, tuve un problema al pagar mi pedido ${number}.`, "Escribir por WhatsApp", true),
          summaryBox(order),
        ],
        "danger",
      );

    case "rechazado":
      return make(
        `No pudimos confirmar el pago de tu pedido ${number}`,
        "Si crees que es un error, escríbenos con tu comprobante.",
        "No pudimos confirmar tu pago",
        [
          { type: "text", text: `Hola ${name}, revisamos el pago de tu pedido ${number} y no pudimos confirmarlo, así que lo anulamos. Si crees que es un error, escríbenos por WhatsApp con tu comprobante.` },
          ...messageBox,
          ...whatsappButton(`Hola TWENTY, les escribo por el pago de mi pedido ${number}.`),
          summaryBox(order),
        ],
        "danger",
      );
  }
}

// ─── Equipo ──────────────────────────────────────────────────────────────────

const NEXT_STEP: Record<OrderDetail["paymentMethod"], string> = {
  tarjeta: "Ya está pagado: toca prepararlo.",
  yape_plin: "Cuando el cliente suba la captura del pago (te llega un aviso) o la mande por WhatsApp, verifica el pago y márcalo como pagado en el panel.",
  whatsapp: "Escríbele por WhatsApp para coordinar el pago.",
};

/** `proof`: la captura del pago ("comprobante"): `src` de la imagen (cid: del adjunto) y qué número de captura es. */
export function teamOrderEmail(
  kind: TeamEmailKind,
  order: OrderDetail,
  { settings, baseUrl }: Ctx,
  change?: { by: string | null; note: string | null; restocked: boolean },
  proof?: { src: string; nth: number },
): OrderEmail {
  const number = formatOrderNumber(order.number);
  const total = formatPrice(order.totalCents);
  const adminButton: EmailBlock = { type: "button", label: "Abrir en el panel", url: `${baseUrl}/admin/pedidos/${order.number}` };
  const n = units(order);
  const items: EmailBlock = { type: "box", title: `Prendas para empacar (${n})`, blocks: [itemsBlock(order, true), totalsBlock(order)] };

  if (kind === "nuevo") {
    const paid = order.paymentMethod === "tarjeta";
    const invoice =
      order.invoiceType === "factura" ? `Factura · RUC ${order.ruc} · ${order.businessName}` : `Boleta · ${DOCUMENT_LABEL[order.documentType]} ${order.documentNumber}`;
    return {
      subject: `Nuevo pedido ${number} · ${total} · ${order.customerName}`,
      content: {
        audience: "team",
        preheader: `${order.customerName} · ${n} ${n === 1 ? "prenda" : "prendas"} · ${order.shippingMethodName}`,
        eyebrow: paid ? "Pagado con Culqi" : `Pendiente de pago · ${PAYMENT_METHOD_LABEL[order.paymentMethod]}`,
        title: `Nuevo pedido ${number}`,
        blocks: [
          { type: "text", text: `${order.customerName} compró ${n} ${n === 1 ? "prenda" : "prendas"} por ${total}. ${NEXT_STEP[order.paymentMethod]}` },
          adminButton,
          ...(order.paymentMethod === "whatsapp"
            ? [
                {
                  type: "button",
                  label: "Escribir al cliente",
                  url: whatsappUrl(customerWhatsapp(order.phone), `Hola ${firstName(order)}, te escribimos de TWENTY por tu pedido ${number} (${total}) para coordinar el pago.`),
                  secondary: true,
                } as const,
              ]
            : []),
          items,
          { type: "box", title: "Entrega", blocks: [{ type: "rows", rows: deliveryRows(order, settings, true) }] },
          {
            type: "box",
            title: "Cliente",
            blocks: [
              {
                type: "rows",
                rows: [
                  ["Nombre", order.customerName],
                  ["Celular", order.phone],
                  ["Email", order.email],
                  ["Comprobante", invoice],
                  ["Pago", PAYMENT_METHOD_LABEL[order.paymentMethod]],
                  ...(order.customerNote ? ([["Nota del cliente", order.customerNote]] as [string, string][]) : []),
                ],
              },
            ],
          },
        ],
      },
    };
  }

  if (kind === "comprobante") {
    const again = (proof?.nth ?? 1) > 1;
    return {
      subject: `${again ? "Otra captura" : "Captura"} de pago · Pedido ${number} · ${total} · ${order.customerName}`,
      content: {
        audience: "team",
        preheader: `${order.customerName} subió ${again ? "otra captura" : "la captura"} del pago de ${total}. Verifica el pago.`,
        eyebrow: `Pedido ${number} · ${PAYMENT_METHOD_LABEL[order.paymentMethod]}`,
        title: again ? "Nueva captura de pago" : "Captura de pago recibida",
        blocks: [
          {
            type: "text",
            text: again
              ? `${order.customerName} subió otra captura del pago de ${total} (la ${proof!.nth}.ª): puede que la anterior estuviera equivocada. Revisa que el monto haya llegado y confírmalo en el panel.`
              : `${order.customerName} subió la captura del pago de ${total} por Yape o Plin. Revisa que el monto haya llegado y márcalo como pagado (o rechazado) en el panel.`,
          },
          ...(proof
            ? ([
                { type: "image", src: proof.src, alt: `Captura del pago del pedido ${number}`, width: 280 },
                { type: "text", text: "La captura también va adjunta a este email.", muted: true, small: true },
              ] as const)
            : []),
          { type: "button", label: "Confirmar en el panel", url: `${baseUrl}/admin/pedidos/${order.number}` },
          items,
        ],
      },
    };
  }

  const verb = kind === "anulado" ? "anuló" : "rechazó";
  const label = kind === "anulado" ? "anulado" : "rechazado";
  return {
    subject: `Pedido ${number} ${label} · ${order.customerName}`,
    content: {
      audience: "team",
      tone: "danger",
      preheader: `${order.customerName} · ${total}${change?.restocked ? " · las prendas volvieron al stock" : ""}`,
      eyebrow: `Pedido ${number}`,
      title: `Pedido ${label}`,
      blocks: [
        {
          type: "text",
          text: `Se ${verb} el pedido ${number} de ${order.customerName} (${total}).${change?.restocked ? " Las prendas volvieron al stock." : ""}`,
        },
        {
          type: "rows",
          rows: [["Lo hizo", change?.by ?? "La tienda (automático)"], ...(change?.note ? ([["Nota", change.note]] as [string, string][]) : [])],
        },
        adminButton,
        items,
      ],
    },
  };
}
