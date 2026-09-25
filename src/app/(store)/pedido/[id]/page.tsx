import { CheckCircle2, Clock, MapPin, MessageCircle, Package, Store, Truck, XCircle } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CopyLinkButton } from "@/components/checkout/copy-link-button";
import { CulqiPay } from "@/components/checkout/culqi-pay";
import { PaymentProofUpload } from "@/components/checkout/payment-proof-upload";
import { OrderProgress } from "@/components/store/order-progress";
import { ShalomTrackingCard } from "@/components/store/shalom-tracking";
import { culqiConfig } from "@/lib/culqi-config";
import { whatsappUrl } from "@/lib/links";
import { formatPrice } from "@/lib/money";
import { formatOrderNumber, STATUS_INFO } from "@/lib/order-status";
import { groupOrderItems } from "@/lib/outfits";
import { getDb } from "@/server/db/client";
import { getOrderForCustomer } from "@/server/services/orders";
import { listPaymentProofs, MAX_PROOFS_PER_ORDER } from "@/server/services/payment-proofs";
import { getShalomTracking, getSiteSettings } from "../../_data";

export const metadata: Metadata = { title: "Tu pedido", robots: { index: false } };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const messageDate = new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

export default function OrderPage({ params, searchParams }: PageProps<"/pedido/[id]">) {
  return (
    <Suspense fallback={<p className="px-4 py-24 text-center text-muted">Cargando tu pedido…</p>}>
      <OrderView params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function OrderView({ params, searchParams }: Pick<PageProps<"/pedido/[id]">, "params" | "searchParams">) {
  const { id } = await params;
  const autoPay = (await searchParams).pagar === "1";
  if (!UUID.test(id)) notFound();
  const [order, settings, proofs] = await Promise.all([getOrderForCustomer(getDb(), id), getSiteSettings(), listPaymentProofs(getDb(), id)]);
  if (!order) notFound();

  const number = formatOrderNumber(order.number);
  const status = STATUS_INFO[order.status];
  const cancelled = order.status === "anulado" || order.status === "rechazado";
  const firstName = order.customerName.split(" ")[0];
  const whatsapp = settings.contact.whatsapp;
  const culqi = culqiConfig();
  const DeliveryIcon = order.shippingKind === "lima_delivery" ? Truck : order.shippingKind === "agency" ? Package : Store;
  // Lo que el equipo le escribió al cambiar el estado (p. ej. la clave de recojo de Shalom), lo último primero.
  const messages = order.history.filter((h) => h.customerMessage).reverse();
  const wallet = order.paymentMethod === "yape_plin";
  const proofWhatsapp = whatsapp ? whatsappUrl(whatsapp, `Hola TWENTY, pagué mi pedido ${number} por ${formatPrice(order.totalCents)}. Les envío la captura.`) : null;

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="text-center">
        {cancelled ? <XCircle className="mx-auto size-12 text-danger" aria-hidden /> : <CheckCircle2 className="mx-auto size-12 text-success" aria-hidden />}
        <h1 className="mt-4 text-2xl font-extrabold tracking-tight">
          {order.status === "pendiente" ? `¡Gracias, ${firstName}!` : status.customerLabel}
        </h1>
        <p className="mt-1 text-muted">
          Pedido <strong className="text-white">{number}</strong> · {formatPrice(order.totalCents)}
        </p>
      </div>

      <OrderProgress status={order.status} className="mt-8" />

      {messages.length ? (
        <section className="mt-8 rounded-2xl border border-line p-5" aria-labelledby="mensajes">
          <h2 id="mensajes" className="flex items-center gap-2 font-semibold">
            <MessageCircle className="size-5" aria-hidden /> Mensajes de TWENTY
          </h2>
          <ul className="mt-3 space-y-3 text-sm">
            {messages.map((h) => (
              <li key={h.id}>
                <p className="whitespace-pre-line">{h.customerMessage}</p>
                <p className="mt-0.5 text-xs text-subtle">
                  {STATUS_INFO[h.toStatus].customerLabel} · {messageDate.format(h.createdAt)}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {order.status === "pendiente" && order.paymentMethod === "tarjeta" ? (
        <div className="mt-8">
          {culqi ? (
            <CulqiPay orderId={order.id} orderNumber={order.number} amountCents={order.totalCents} email={order.email} publicKey={culqi.publicKey} autoOpen={autoPay} />
          ) : (
            <p className="rounded-2xl bg-raised p-5 text-center text-sm">
              El pago con tarjeta no está disponible en este momento. Escríbenos por WhatsApp y te ayudamos a pagar.
            </p>
          )}
        </div>
      ) : null}

      {order.status === "pendiente" && wallet ? (
        <section id="pago" className="mt-8 scroll-mt-20 rounded-2xl bg-white p-6 text-center text-black">
          <h2 className="text-lg font-bold">Paga {formatPrice(order.totalCents)} con Yape o Plin</h2>
          {settings.payments.walletQr ? (
            <Image
              src={settings.payments.walletQr}
              alt="Código QR para pagar con Yape o Plin"
              width={423}
              height={423}
              className="mx-auto mt-4 w-56"
            />
          ) : null}
          {settings.payments.walletName ? <p className="mt-2 text-sm font-semibold">{settings.payments.walletName}</p> : null}
          {settings.payments.walletDescription ? <p className="text-sm text-black/70">{settings.payments.walletDescription}</p> : null}
          <ol className="mx-auto mt-4 max-w-sm space-y-1 text-left text-sm">
            <li>1. Escanea el QR desde tu app de Yape o Plin.</li>
            <li>2. Paga exactamente {formatPrice(order.totalCents)}.</li>
            <li>3. Sube aquí la captura del pago.</li>
          </ol>
          <PaymentProofUpload orderId={order.id} tone="light" whatsappHref={proofWhatsapp} />
        </section>
      ) : null}

      {order.status === "por_verificar" && wallet ? (
        <section id="pago" className="mt-8 scroll-mt-20 rounded-2xl bg-raised p-6 text-center">
          <Clock className="mx-auto size-8" aria-hidden />
          <h2 className="mt-3 text-lg font-bold">{proofs.length ? "Recibimos tu captura" : "Estamos verificando tu pago"}</h2>
          <p className="mt-1 text-sm text-muted">
            Estamos verificando tu pago de {formatPrice(order.totalCents)}. Te avisaremos por email apenas lo confirmemos.
          </p>
          {proofs.length ? (
            <ul className="mt-5 flex flex-wrap justify-center gap-3">
              {proofs.map((p) => (
                <li key={p.id}>
                  <a href={`/pedido/${order.id}/captura/${p.id}`} target="_blank" rel="noopener noreferrer" className="block">
                    {/* eslint-disable-next-line @next/next/no-img-element -- imagen privada del pedido, no pasa por el bucket */}
                    <img
                      src={`/pedido/${order.id}/captura/${p.id}`}
                      alt={`Captura enviada el ${messageDate.format(p.createdAt)}`}
                      width={p.width}
                      height={p.height}
                      loading="lazy"
                      className="h-32 w-auto rounded-lg border border-line object-contain"
                    />
                    <span className="mt-1 block text-xs text-subtle">{messageDate.format(p.createdAt)}</span>
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
          {proofs.length < MAX_PROOFS_PER_ORDER ? (
            <PaymentProofUpload
              orderId={order.id}
              tone="dark"
              label={proofs.length ? "Subir otra captura" : "Subir captura del pago"}
              secondary={proofs.length > 0}
              whatsappHref={proofWhatsapp}
            />
          ) : null}
        </section>
      ) : null}

      {order.status === "pendiente" && order.paymentMethod === "whatsapp" ? (
        <section className="mt-8 rounded-2xl bg-raised p-6 text-center">
          <Clock className="mx-auto size-8" aria-hidden />
          <h2 className="mt-3 text-lg font-bold">Te escribimos para coordinar el pago</h2>
          <p className="mt-1 text-sm text-muted">Te contactaremos al {order.phone}. Si prefieres, escríbenos ahora.</p>
          {whatsapp ? (
            <a
              href={whatsappUrl(whatsapp, `Hola TWENTY, quiero coordinar el pago de mi pedido ${number} (${formatPrice(order.totalCents)}).`)}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-5 flex h-13 items-center justify-center gap-2 rounded-full bg-white text-sm font-bold tracking-wide text-black uppercase"
            >
              <MessageCircle className="size-5" aria-hidden /> Escribir por WhatsApp
            </a>
          ) : null}
        </section>
      ) : null}

      <section className="mt-8 rounded-2xl border border-line p-5">
        <h2 className="flex items-center gap-2 font-semibold">
          <DeliveryIcon className="size-5" aria-hidden /> {order.shippingMethodName}
        </h2>
        <div className="mt-2 space-y-1 text-sm text-muted">
          {order.shippingKind === "lima_delivery" ? (
            <p className="flex gap-2">
              <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />
              {order.address}, {order.district}
              {order.addressReference ? ` (${order.addressReference})` : ""}
            </p>
          ) : null}
          {order.shippingKind === "agency" ? (
            <>
              <p>
                Recoges en: {order.agencyName} · {order.district}, {order.department}
              </p>
              <p>El envío lo pagas al recoger. Lleva tu {order.documentType.toUpperCase()} {order.documentNumber}.</p>
            </>
          ) : null}
          {order.shippingKind === "store_pickup" && settings.store ? (
            <>
              <p>{settings.store.address}</p>
              {settings.contact.openingHours ? <p>{settings.contact.openingHours}</p> : null}
            </>
          ) : null}
          <p>
            A nombre de {order.customerName} · {order.phone}
          </p>
        </div>
      </section>

      {order.trackingNumber && order.trackingCode ? (
        <Suspense fallback={<div className="mt-4 h-40 animate-pulse rounded-2xl bg-raised" aria-busy="true" />}>
          <ShalomTracking number={order.trackingNumber} code={order.trackingCode} />
        </Suspense>
      ) : null}

      <section className="mt-4 rounded-2xl border border-line p-5">
        <h2 className="font-semibold">Tu compra</h2>
        <ul className="mt-3 space-y-3">
          {groupOrderItems(order.items).map((group) =>
            group.kind === "single" ? (
              <li key={group.item.id} className="flex gap-3 text-sm">
                <span className="relative aspect-3/4 w-12 shrink-0 overflow-hidden rounded bg-raised">
                  {group.item.image ? <Image src={group.item.image} alt="" fill sizes="48px" className="object-cover" /> : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block">{group.item.productName}</span>
                  <span className="block text-xs text-muted">
                    {group.item.colorName} · Talla {group.item.sizeLabel} · x{group.item.quantity}
                  </span>
                </span>
                <span>{formatPrice(group.item.totalCents)}</span>
              </li>
            ) : (
              <li key={group.key} className="flex gap-3 text-sm">
                <span className="relative aspect-3/4 w-12 shrink-0 overflow-hidden rounded bg-raised">
                  {group.items[0].image ? <Image src={group.items[0].image} alt="" fill sizes="48px" className="object-cover" /> : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block">
                    {group.name} <span className="text-muted">· x{group.quantity}</span>
                  </span>
                  {group.items.map((item) => (
                    <span key={item.id} className="block text-xs text-muted">
                      {item.productName}: {item.colorName}, talla {item.sizeLabel}
                    </span>
                  ))}
                </span>
                <span>{formatPrice(group.totalCents)}</span>
              </li>
            ),
          )}
        </ul>
        <dl className="mt-4 space-y-2 border-t border-line pt-4 text-sm">
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
            <dd>{order.shippingCents ? formatPrice(order.shippingCents) : order.paymentOnDelivery ? "Pagas al recoger" : "Gratis"}</dd>
          </div>
          <div className="flex justify-between border-t border-line pt-3 text-base font-bold">
            <dt>Total</dt>
            <dd>{formatPrice(order.totalCents)}</dd>
          </div>
        </dl>
      </section>

      <div className="mt-6 rounded-2xl bg-raised p-5 text-center text-sm">
        <p>Guarda este enlace: aquí verás el estado de tu pedido.</p>
        <CopyLinkButton />
      </div>
    </div>
  );
}

/** Estado de la guía de Shalom (aparte: si la API tarda, el resto del pedido ya se ve). */
async function ShalomTracking({ number, code }: { number: string; code: string }) {
  return <ShalomTrackingCard number={number} code={code} tracking={await getShalomTracking(number, code)} className="mt-4" />;
}
