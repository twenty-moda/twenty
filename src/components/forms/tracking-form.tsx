"use client";

import { CheckCircle2, Clock, MessageCircle, Package, Plus, Search, Store, Truck, XCircle } from "lucide-react";
import { useActionState } from "react";
import { openOrderDetailAction, trackOrderAction, type TrackingState } from "@/app/(store)/tracking/actions";
import { OrderProgress } from "@/components/store/order-progress";
import { ShalomTrackingCard } from "@/components/store/shalom-tracking";
import { idle } from "@/lib/action-state";
import { whatsappUrl } from "@/lib/links";
import { formatOrderNumber, STATUS_INFO, type OrderStatus } from "@/lib/order-status";
import type { ShalomTracking } from "@/lib/shalom";
import type { OrderTracking } from "@/server/services/orders";
import { FormMessage, SubmitButton, TextField } from "../ui/form-feedback";

const dateFormat = new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

const STATUS_ICON: Record<OrderStatus, typeof Clock> = {
  pendiente: Clock,
  por_verificar: Clock,
  pagado: Package,
  en_preparacion: Package,
  enviado: Truck,
  entregado: CheckCircle2,
  anulado: XCircle,
  rechazado: XCircle,
};

/** Rastreo con solo el número de pedido; el resultado sale debajo, sin cambiar de página. */
export function TrackingForm({ whatsapp }: { whatsapp: string }) {
  const [state, action] = useActionState(trackOrderAction, idle as TrackingState);
  return (
    <>
      <div className="rounded-2xl border border-line bg-surface p-5 md:p-8">
        <form action={action} className="space-y-4" noValidate>
          <TextField
            label="Número de pedido"
            name="number"
            state={state}
            inputMode="numeric"
            autoComplete="off"
            placeholder="Ej: 1024"
            hint="Está en el email o mensaje de confirmación de tu compra."
            required
          />
          <FormMessage state={state} />
          <SubmitButton pendingLabel="Buscando…">
            <Search className="size-4" aria-hidden /> Rastrear pedido
          </SubmitButton>
        </form>
      </div>
      {state.order ? <TrackingResult key={state.at} order={state.order} shalom={state.shalom ?? null} whatsapp={whatsapp} /> : null}
    </>
  );
}

function TrackingResult({ order, shalom, whatsapp }: { order: OrderTracking; shalom: ShalomTracking | null; whatsapp: string }) {
  const number = formatOrderNumber(order.number);
  const Icon = STATUS_ICON[order.status];
  const cancelled = order.status === "anulado" || order.status === "rechazado";
  const DeliveryIcon = order.shippingKind === "lima_delivery" ? Truck : order.shippingKind === "agency" ? Package : Store;
  // Lo último primero. El primer paso es la compra: "Pedido recibido" dice más que "Esperando tu pago".
  const steps = order.history.map((h, i) => ({ ...h, label: i === 0 && h.status === "pendiente" ? "Pedido recibido" : STATUS_INFO[h.status].customerLabel })).reverse();

  return (
    <section aria-live="polite" aria-labelledby="estado" className="mt-6 animate-fade-in rounded-2xl border border-line p-5 md:p-8">
      <p className="text-xs font-bold tracking-widest text-muted uppercase">Pedido {number}</p>
      <h2 id="estado" className="mt-2 flex items-center gap-2 text-2xl font-extrabold tracking-tight">
        <Icon className={cancelled ? "size-6 shrink-0 text-danger" : "size-6 shrink-0 text-success"} aria-hidden />
        {STATUS_INFO[order.status].customerLabel}
      </h2>

      <OrderProgress status={order.status} className="mt-6" />

      <ol className="mt-6 space-y-3 border-l border-line pl-4">
        {steps.map((s, i) => (
          <li key={`${s.status}-${s.at.toISOString()}`} className="relative text-sm">
            <span className={`absolute top-1.5 left-[calc(-1rem-4.5px)] size-2 rounded-full ${i === 0 ? "bg-white" : "bg-subtle"}`} aria-hidden />
            <span className={i === 0 ? "font-semibold" : "text-muted"}>{s.label}</span>
            <span className="block text-xs text-subtle">{dateFormat.format(s.at)}</span>
          </li>
        ))}
      </ol>

      <p className="mt-6 flex items-center gap-2 text-sm text-muted">
        <DeliveryIcon className="size-4 shrink-0" aria-hidden /> {order.shippingMethodName}
      </p>

      {/* Sin el N° de orden ni el código de Shalom: están en el detalle completo. */}
      {shalom ? <ShalomTrackingCard tracking={shalom} className="mt-4" /> : null}

      <details className="group smooth-details mt-6 rounded-xl bg-raised">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 text-sm font-semibold">
          {shalom ? "Ver prendas, dirección, pago y guía" : "Ver prendas, dirección y pago"}
          <Plus className="size-4 shrink-0 transition duration-300 group-open:rotate-45" aria-hidden />
        </summary>
        <div className="px-4 pb-4">
          <p className="mb-3 text-xs text-muted">Por seguridad, confirma el celular o el email con que compraste.</p>
          <DetailForm number={order.number} />
        </div>
      </details>

      {whatsapp ? (
        <a
          href={whatsappUrl(whatsapp, `Hola TWENTY, quiero consultar por mi pedido ${number}.`)}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 flex h-12 items-center justify-center gap-2 rounded-full border border-line text-sm font-semibold"
        >
          <MessageCircle className="size-4" aria-hidden /> Consultar por WhatsApp
        </a>
      ) : null}
    </section>
  );
}

function DetailForm({ number }: { number: number }) {
  const [state, action] = useActionState(openOrderDetailAction, idle);
  return (
    <form action={action} className="space-y-3" noValidate>
      <input type="hidden" name="number" value={number} />
      <TextField label="Celular o email de la compra" name="contact" state={state} autoComplete="email" placeholder="987 654 321 o tu@correo.com" required />
      <FormMessage state={state} />
      <SubmitButton pendingLabel="Abriendo…">Ver detalle completo</SubmitButton>
    </form>
  );
}
