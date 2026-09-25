import { Mail, MapPin, Package, Phone, Store, Truck } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminPage, Badge, Card, formatDateTime, StatusBadge } from "@/components/admin/ui";
import { cn } from "@/lib/cn";
import { siteUrl, whatsappUrl } from "@/lib/links";
import { formatPrice } from "@/lib/money";
import { DOCUMENT_LABEL, formatOrderNumber, PAYMENT_METHOD_LABEL, STATUS_INFO } from "@/lib/order-status";
import { groupOrderItems } from "@/lib/outfits";
import { REFUND_REASON_INFO, soldOutUnits } from "@/lib/refunds";
import { isShalomOrder } from "@/lib/shalom";
import { ShalomTrackingCard } from "@/components/store/shalom-tracking";
import { getShalomTracking } from "@/app/(store)/_data";
import { Suspense } from "react";
import { getDb } from "@/server/db/client";
import { emailConfigured } from "@/server/services/email";
import { getOrderByNumber } from "@/server/services/orders";
import { listPaymentProofs } from "@/server/services/payment-proofs";
import { listOrderPayments } from "@/server/services/payments";
import { getRefundOptions } from "@/server/services/refunds";
import { requireAdmin } from "../../../_lib/auth";
import { PendingRefundActions, RefundLauncher } from "./refund-panel";
import { InternalNoteForm, StatusChanger, TrackingForm } from "./status-changer";

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
  const [paymentRows, proofs] = await Promise.all([listOrderPayments(db, order.id), listPaymentProofs(db, order.id)]);
  const refundOptions = await getRefundOptions(db, order, paymentRows, Boolean(process.env.CULQI_SECRET_KEY));
  // Prendas devueltas por agotadas (también las de devoluciones sin confirmar).
  const soldOut = soldOutUnits(order.refunds);
  const itemById = new Map(order.items.map((i) => [i.id, i]));

  const orderLabel = formatOrderNumber(order.number);
  const firstName = order.customerName.split(" ")[0];
  const customerLink = `${siteUrl()}/pedido/${order.id}`;
  const message = `Hola ${firstName}, te escribimos de TWENTY por tu pedido ${orderLabel}: ${STATUS_INFO[order.status].customerLabel.toLowerCase()}. Puedes verlo aquí: ${customerLink}`;
  const DeliveryIcon = order.shippingKind === "lima_delivery" ? Truck : order.shippingKind === "agency" ? Package : Store;
  const shalom = isShalomOrder(order);
  const tracking = order.trackingNumber && order.trackingCode ? { number: order.trackingNumber, code: order.trackingCode } : null;

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
          {order.paymentMethod === "yape_plin" ? (
            <Card title="Captura del pago (Yape / Plin)">
              {proofs.length ? (
                <>
                  <ul className="flex flex-wrap gap-3">
                    {proofs.map((p) => (
                      <li key={p.id}>
                        <a href={`/admin/comprobantes/${p.id}`} target="_blank" rel="noopener noreferrer" className="block" title="Ver en grande">
                          {/* eslint-disable-next-line @next/next/no-img-element -- imagen privada, se sirve solo al equipo */}
                          <img
                            src={`/admin/comprobantes/${p.id}`}
                            alt={`Captura subida el ${formatDateTime(p.createdAt)}`}
                            width={p.width}
                            height={p.height}
                            className="h-56 w-auto rounded-lg border border-line bg-raised object-contain"
                          />
                          <span className="mt-1 block text-xs text-muted">{formatDateTime(p.createdAt)}</span>
                        </a>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-3 text-sm text-muted">
                    Revisa en tu app de Yape o Plin que llegaron {formatPrice(order.totalCents)} y toca “Confirmar pago” (o “Rechazar pago” si no llegó). Toca la
                    captura para verla en grande.
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted">
                  {order.status === "pendiente"
                    ? "El cliente todavía no sube la captura en la página de su pedido. Si te la mandó por WhatsApp, verifica el pago y confírmalo aquí abajo."
                    : "El cliente no subió una captura en la web."}
                </p>
              )}
            </Card>
          ) : null}

          <Card title="Cambiar estado">
            <StatusChanger
              orderId={order.id}
              status={order.status}
              whatsappHref={whatsappUrl(order.phone.startsWith("51") ? order.phone : `51${order.phone}`, message)}
              emailEnabled={emailConfigured()}
              shalom={shalom && tracking}
              refund={refundOptions}
            />
          </Card>

          {refundOptions.paidCents > 0 || order.refunds.length ? (
            <Card title="Devoluciones">
              <div className="space-y-4">
                {order.refunds.length ? (
                  <ul className="space-y-3">
                    {order.refunds.map((r) => (
                      <li key={r.id} className={cn("rounded-xl border p-4 text-sm", r.status === "pendiente" ? "border-warning/50" : "border-line")}>
                        <p className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-base font-semibold">{formatPrice(r.amountCents)}</span>
                          <Badge tone={r.status === "pendiente" ? "warning" : "success"}>
                            {r.status === "pendiente" ? "Sin confirmar" : r.method === "culqi" ? "Devuelta por Culqi" : "Devuelta por fuera"}
                          </Badge>
                        </p>
                        <p className="mt-1 text-muted">
                          {REFUND_REASON_INFO[r.reason].label} · {formatDateTime(r.createdAt)} · {r.createdByName ?? "Equipo"}
                        </p>
                        {r.items.length ? (
                          <ul className="mt-1 text-muted">
                            {r.items.map((ri) => {
                              const item = itemById.get(ri.orderItemId);
                              return item ? (
                                <li key={ri.orderItemId}>
                                  Agotada: {ri.quantity} × {item.productName} ({item.colorName}, talla {item.sizeLabel})
                                </li>
                              ) : null;
                            })}
                          </ul>
                        ) : null}
                        {r.note ? <p className="mt-1 text-muted">“{r.note}”</p> : null}
                        {r.customerMessage ? <p className="mt-1 text-muted">Al cliente: “{r.customerMessage}”</p> : null}
                        {r.providerId ? <p className="mt-1 font-mono text-xs break-all text-subtle">{r.providerId}</p> : null}
                        {r.status === "pendiente" ? (
                          <>
                            <p className="mt-2 text-warning">
                              Culqi no respondió. Busca el cargo en CulqiPanel: si ves la devolución, confírmala; si no, descártala y vuelve a intentarlo.
                            </p>
                            <PendingRefundActions orderId={order.id} refundId={r.id} />
                          </>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {refundOptions.availableCents > 0 ? (
                  <>
                    <p className="text-sm text-muted">
                      {order.refunds.length
                        ? `Todavía puedes devolver ${formatPrice(refundOptions.availableCents)}.`
                        : `Si falta una prenda o quieres dar una cortesía, devuelve todo o una parte de los ${formatPrice(refundOptions.paidCents)} sin anular el pedido.`}
                    </p>
                    <RefundLauncher orderId={order.id} options={refundOptions} customerFirstName={firstName} emailEnabled={emailConfigured()} />
                  </>
                ) : (
                  <p className="text-sm text-muted">Ya se devolvió todo lo que pagó el cliente.</p>
                )}
              </div>
            </Card>
          ) : null}

          <Card title={`Prendas (${order.items.reduce((s, i) => s + i.quantity, 0)})`}>
            <ul className="divide-y divide-line">
              {groupOrderItems(order.items).map((group) =>
                group.kind === "single" ? (
                  <li key={group.item.id} className="flex gap-3 py-3 first:pt-0">
                    <ItemPhoto image={group.item.image} />
                    <span className="min-w-0 flex-1 text-sm">
                      <span className="block font-medium">{group.item.productName}</span>
                      <span className="block text-muted">
                        {group.item.colorName} · Talla {group.item.sizeLabel} · <span className="font-mono">{group.item.sku}</span>
                      </span>
                      <span className="block text-muted">
                        {group.item.quantity} × {formatPrice(group.item.unitPriceCents)}
                        {group.item.discountCents ? <span className="text-success"> · promo -{formatPrice(group.item.discountCents)}</span> : null}
                      </span>
                      <SoldOutBadge units={soldOut.get(group.item.id)} quantity={group.item.quantity} />
                    </span>
                    <span className="text-sm font-semibold">{formatPrice(group.item.totalCents)}</span>
                  </li>
                ) : (
                  <li key={group.key} className="py-3 first:pt-0">
                    <p className="flex justify-between gap-3 text-sm">
                      <span>
                        <span className="font-medium">{group.name}</span>
                        <span className="text-muted">
                          {" "}
                          · conjunto · {group.quantity} × {formatPrice(group.totalCents / group.quantity)}
                        </span>
                      </span>
                      <span className="font-semibold">{formatPrice(group.totalCents)}</span>
                    </p>
                    <ul className="mt-2 space-y-2 border-l-2 border-line pl-3">
                      {group.items.map((item) => (
                        <li key={item.id} className="flex gap-3">
                          <ItemPhoto image={item.image} />
                          <span className="min-w-0 flex-1 text-sm">
                            <span className="block">{item.productName}</span>
                            <span className="block text-muted">
                              {item.colorName} · Talla {item.sizeLabel} · <span className="font-mono">{item.sku}</span> · x{item.quantity}
                            </span>
                            <SoldOutBadge units={soldOut.get(item.id)} quantity={item.quantity} />
                          </span>
                        </li>
                      ))}
                    </ul>
                  </li>
                ),
              )}
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
              {refundOptions.refundedCents ? (
                <div className="flex justify-between text-warning">
                  <dt>Devuelto</dt>
                  <dd>-{formatPrice(refundOptions.refundedCents)}</dd>
                </div>
              ) : null}
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
                  {order.agencyId ? <p className="text-xs text-subtle">Agencia elegida de la lista de Shalom (id {order.agencyId}).</p> : null}
                </>
              ) : null}
              {shalom ? (
                <div className="mt-4 border-t border-line pt-4">
                  <TrackingForm orderId={order.id} tracking={tracking} />
                </div>
              ) : null}
              {order.shippingKind === "store_pickup" ? <p className="text-muted">Recoge en la tienda de Gamarra.</p> : null}
            </div>
          </Card>

          {tracking ? (
            <Suspense fallback={<div className="h-40 animate-pulse rounded-2xl bg-raised" aria-busy="true" />}>
              <AdminShalomTracking {...tracking} />
            </Suspense>
          ) : null}

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

function SoldOutBadge({ units, quantity }: { units: number | undefined; quantity: number }) {
  if (!units) return null;
  return (
    <span className="mt-1 block">
      <Badge tone="warning">{units >= quantity ? "Agotada · no se envía" : `${units} agotada${units > 1 ? "s" : ""} · no se envía${units > 1 ? "n" : ""}`}</Badge>
    </span>
  );
}

function ItemPhoto({ image }: { image: string | null }) {
  return (
    <span className="relative aspect-3/4 w-14 shrink-0 overflow-hidden rounded-md bg-raised">
      {image ? <Image src={image} alt="" fill sizes="56px" className="object-cover" /> : null}
    </span>
  );
}

async function AdminShalomTracking({ number, code }: { number: string; code: string }) {
  return <ShalomTrackingCard number={number} code={code} tracking={await getShalomTracking(number, code)} />;
}
