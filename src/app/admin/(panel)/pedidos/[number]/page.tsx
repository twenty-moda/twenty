import { Mail, MapPin, Package, Phone, Store, Truck } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminPage, Card, formatDateTime, StatusBadge } from "@/components/admin/ui";
import { siteUrl, whatsappUrl } from "@/lib/links";
import { formatPrice } from "@/lib/money";
import { DOCUMENT_LABEL, formatOrderNumber, PAYMENT_METHOD_LABEL, STATUS_INFO } from "@/lib/order-status";
import { getDb } from "@/server/db/client";
import { emailConfigured } from "@/server/services/email";
import { getOrderByNumber } from "@/server/services/orders";
import { listOrderPayments } from "@/server/services/payments";
import { requireAdmin } from "../../../_lib/auth";
import { InternalNoteForm, StatusChanger } from "./status-changer";

export async function generateMetadata({ params }: PageProps<"/admin/pedidos/[number]">): Promise<Metadata> {
  const { number } = await params;
  return { title: `Pedido #${number}` };
}

// El admin se arma en el servidor en cada visita (lee la sesión): no se exige navegación instantánea.
export const instant = false;

export default async function AdminOrderPage({ params }: PageProps<"/admin/pedidos/[number]">) {
  await requireAdmin();
  const { number } = await params;
  const n = Number(number);
  if (!Number.isInteger(n)) notFound();
  const db = getDb();
  const order = await getOrderByNumber(db, n);
  if (!order) notFound();
  const paymentRows = await listOrderPayments(db, order.id);

  const orderLabel = formatOrderNumber(order.number);
  const firstName = order.customerName.split(" ")[0];
  const customerLink = `${siteUrl()}/pedido/${order.id}`;
  const message = `Hola ${firstName}, te escribimos de TWENTY por tu pedido ${orderLabel}: ${STATUS_INFO[order.status].customerLabel.toLowerCase()}. Puedes verlo aquí: ${customerLink}`;
  const DeliveryIcon = order.shippingKind === "lima_delivery" ? Truck : order.shippingKind === "agency" ? Package : Store;

  return (
    <AdminPage
      back={{ href: "/admin/pedidos", label: "Pedidos" }}
      title={
        <span className="flex flex-wrap items-center gap-3">
          Pedido {orderLabel} <StatusBadge status={order.status} />
        </span>
      }
      description={`${formatDateTime(order.createdAt)} · ${formatPrice(order.totalCents)} · ${PAYMENT_METHOD_LABEL[order.paymentMethod]}`}
    >
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="space-y-4">
          <Card title="Cambiar estado">
            <StatusChanger
              orderId={order.id}
              status={order.status}
              whatsappHref={whatsappUrl(order.phone.startsWith("51") ? order.phone : `51${order.phone}`, message)}
              emailEnabled={emailConfigured()}
            />
          </Card>

          <Card title={`Prendas (${order.items.reduce((s, i) => s + i.quantity, 0)})`}>
            <ul className="divide-y divide-line">
              {order.items.map((item) => (
                <li key={item.id} className="flex gap-3 py-3 first:pt-0">
                  <span className="relative aspect-3/4 w-14 shrink-0 overflow-hidden rounded-md bg-raised">
                    {item.image ? <Image src={item.image} alt="" fill sizes="56px" className="object-cover" /> : null}
                  </span>
                  <span className="min-w-0 flex-1 text-sm">
                    <span className="block font-medium">{item.productName}</span>
                    <span className="block text-muted">
                      {item.colorName} · Talla {item.sizeLabel} · <span className="font-mono">{item.sku}</span>
                    </span>
                    <span className="block text-muted">
                      {item.quantity} × {formatPrice(item.unitPriceCents)}
                      {item.discountCents ? <span className="text-success"> · promo -{formatPrice(item.discountCents)}</span> : null}
                    </span>
                  </span>
                  <span className="text-sm font-semibold">{formatPrice(item.totalCents)}</span>
                </li>
              ))}
            </ul>
            <dl className="mt-3 space-y-2 border-t border-line pt-4 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted">Subtotal</dt>
                <dd>{formatPrice(order.subtotalCents)}</dd>
              </div>
              {order.promotions.map((p) => (
                <div key={p.id} className="flex justify-between text-success">
                  <dt>Promo {p.name}</dt>
                  <dd>-{formatPrice(p.discountCents)}</dd>
                </div>
              ))}
              <div className="flex justify-between">
                <dt className="text-muted">Envío</dt>
                <dd>{order.shippingCents ? formatPrice(order.shippingCents) : order.paymentOnDelivery ? "Paga al recoger" : "Gratis"}</dd>
              </div>
              <div className="flex justify-between border-t border-line pt-3 text-base font-bold">
                <dt>Total a cobrar</dt>
                <dd>{formatPrice(order.totalCents)}</dd>
              </div>
            </dl>
          </Card>

          <Card title="Historial">
            <ol className="space-y-4">
              {[...order.history].reverse().map((h) => (
                <li key={h.id} className="flex gap-3 text-sm">
                  <span className="mt-1.5 size-2 shrink-0 rounded-full bg-white" aria-hidden />
                  <span>
                    <span className="font-medium">{STATUS_INFO[h.toStatus].label}</span>
                    <span className="block text-xs text-muted">
                      {formatDateTime(h.createdAt)} · {h.changedByName ?? "Cliente / web"}
                    </span>
                    {h.note ? <span className="mt-1 block text-muted">“{h.note}”</span> : null}
                    {h.customerMessage ? <span className="mt-1 block text-muted">Al cliente: “{h.customerMessage}”</span> : null}
                  </span>
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <div className="space-y-4">
          <Card
            title="Cliente"
            actions={
              <Link href={`/admin/clientes/${order.customerId}`} className="text-sm text-muted hover:text-white">
                Ver historial
              </Link>
            }
          >
            <div className="space-y-2 text-sm">
              <p className="font-medium">{order.customerName}</p>
              <p className="flex items-center gap-2 text-muted">
                <Phone className="size-4" aria-hidden />
                <a href={`tel:${order.phone}`} className="hover:text-white">
                  {order.phone}
                </a>
              </p>
              <p className="flex items-center gap-2 text-muted">
                <Mail className="size-4" aria-hidden />
                <a href={`mailto:${order.email}`} className="truncate hover:text-white">
                  {order.email}
                </a>
              </p>
              <p className="text-muted">
                {DOCUMENT_LABEL[order.documentType]} {order.documentNumber}
              </p>
              <p className="border-t border-line pt-2">
                {order.invoiceType === "factura" ? (
                  <>
                    Factura · RUC {order.ruc}
                    <span className="block text-muted">{order.businessName}</span>
                  </>
                ) : (
                  "Boleta"
                )}
              </p>
            </div>
          </Card>

          <Card
            title={
              <span className="flex items-center gap-2">
                <DeliveryIcon className="size-4" aria-hidden /> {order.shippingMethodName}
              </span>
            }
          >
            <div className="space-y-1 text-sm">
              {order.shippingKind === "lima_delivery" ? (
                <>
                  <p className="flex gap-2">
                    <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden /> {order.address}
                  </p>
                  <p className="text-muted">
                    {order.district}, {order.province}
                  </p>
                  {order.addressReference ? <p className="text-muted">Ref.: {order.addressReference}</p> : null}
                </>
              ) : null}
              {order.shippingKind === "agency" ? (
                <>
                  <p>Agencia: {order.agencyName}</p>
                  <p className="text-muted">
                    {order.district}, {order.province} - {order.department}
                  </p>
                  <p className="text-warning">El cliente paga el envío al recoger.</p>
                </>
              ) : null}
              {order.shippingKind === "store_pickup" ? <p className="text-muted">Recoge en la tienda de Gamarra.</p> : null}
            </div>
          </Card>

          {paymentRows.length ? (
            <Card title="Cobros en línea">
              <ul className="space-y-2 text-sm">
                {paymentRows.map((p) => (
                  <li key={p.id} className="flex justify-between gap-3">
                    <span>
                      {p.method === "yape" ? "Yape" : "Tarjeta"} · Culqi
                      <span className="block font-mono text-xs text-subtle">{p.providerId}</span>
                    </span>
                    <span className="font-semibold text-success">{formatPrice(p.amountCents)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          {order.customerNote ? (
            <Card title="Nota del cliente">
              <p className="text-sm whitespace-pre-line">{order.customerNote}</p>
            </Card>
          ) : null}

          <Card title="Nota interna">
            <InternalNoteForm orderId={order.id} note={order.internalNote} />
          </Card>

          <p className="px-1 text-xs text-subtle">
            Enlace del cliente para ver su pedido:{" "}
            <a href={customerLink} target="_blank" rel="noopener noreferrer" className="break-all underline">
              {customerLink}
            </a>
          </p>
        </div>
      </div>
    </AdminPage>
  );
}
