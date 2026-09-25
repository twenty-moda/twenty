"use client";

import { Undo2 } from "lucide-react";
import { useActionState, useId, useState } from "react";
import { FormAlert, Toggle } from "@/components/admin/form-controls";
import { buttonClass } from "@/components/admin/ui";
import { inputClass } from "@/components/ui/form";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/cn";
import { formatPrice } from "@/lib/money";
import { parseSoles, suggestSoldOutRefund, type RefundReason } from "@/lib/refunds";
import type { RefundOptions } from "@/server/services/refunds";
import { idle, type ActionState } from "../../../_lib/action-state";
import { refundAction, resolveRefundAction } from "../actions";
import { ReasonPicker, SoldOutPicker } from "./refund-fields";

/** 4990 → "49.90", 5000 → "50" (para el campo del monto). */
const centsToInput = (cents: number) => (cents / 100).toFixed(2).replace(/\.00$/, "");

type RefundLauncherProps = {
  orderId: string;
  options: RefundOptions;
  customerFirstName: string;
  /** Resend configurado: se puede avisar al cliente por email. */
  emailEnabled: boolean;
};

/** Botón "Devolver dinero" + panel con el formulario: motivo, prendas agotadas, monto, medio y aviso al cliente. */
export function RefundLauncher({ orderId, options, customerFirstName, emailEnabled }: RefundLauncherProps) {
  const formId = useId();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<RefundReason | null>(null);
  const [selected, setSelected] = useState<Record<string, number>>({});
  const [mode, setMode] = useState<"todo" | "monto">("todo");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<"culqi" | "manual">(options.culqi ? "culqi" : "manual");
  // Controlados: React vacía los campos no controlados del formulario después de cada acción, también si falla.
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [confirming, setConfirming] = useState(false);

  const [state, action, pending] = useActionState(async (prev: ActionState, formData: FormData) => {
    const result = await refundAction(orderId, prev, formData);
    if (result.status === "success") {
      setOpen(false);
      setReason(null);
      setSelected({});
      setMode("todo");
      setAmount("");
      setNote("");
      setMessage("");
    }
    setConfirming(false);
    return result;
  }, idle);

  const max = method === "culqi" && options.culqi ? options.culqi.maxCents : options.availableCents;
  const amountCents = mode === "todo" ? max : parseSoles(amount);
  const soldOutCount = Object.values(selected).filter((q) => q > 0).length;
  const amountError = mode === "monto" && amount !== "" && !(amountCents > 0 && amountCents <= max) ? `Escribe un monto entre S/ 0.10 y ${formatPrice(max)}.` : null;
  const ready = !!reason && (reason !== "agotado" || soldOutCount > 0) && Number.isFinite(amountCents) && amountCents > 0 && amountCents <= max;
  const price = Number.isFinite(amountCents) ? formatPrice(amountCents) : "";

  // Al marcar prendas agotadas se sugiere lo que costaron (y el envío si ya no queda nada por enviar).
  const pickSoldOut = (next: Record<string, number>) => {
    setSelected(next);
    const suggestion = Math.min(suggestSoldOutRefund(options.items, next, options.shippingCents), max);
    if (suggestion > 0) {
      setMode(suggestion === max ? "todo" : "monto");
      setAmount(centsToInput(suggestion));
    }
    setConfirming(false);
  };

  return (
    <div className="space-y-3">
      <button type="button" onClick={() => setOpen(true)} className={buttonClass("secondary")}>
        <Undo2 className="size-4" aria-hidden /> Devolver dinero
      </button>
      {!open ? <FormAlert state={state} /> : null}

      <Sheet
        open={open}
        onClose={() => {
          setOpen(false);
          setConfirming(false);
        }}
        title="Devolver dinero"
        side="bottom"
        footer={
          <div className="space-y-3 pb-3">
            {confirming ? (
              <p className="text-sm text-warning">
                {method === "culqi"
                  ? `Culqi le devuelve ${price} a ${customerFirstName}, a la tarjeta o el Yape con que pagó. No se puede deshacer.`
                  : `Se registra que ya le devolviste ${price} a ${customerFirstName} por tu cuenta. La web no mueve dinero.`}
              </p>
            ) : null}
            {/* Cada botón con su `key`: si React reusara el de "Devolver" como submit, el mismo toque enviaría el formulario. */}
            <div className="flex flex-wrap gap-2">
              {confirming ? (
                <>
                  <button key="confirmar" type="submit" form={formId} disabled={pending} className={cn(buttonClass("primary"), "flex-1")}>
                    {pending ? "Devolviendo…" : method === "culqi" ? `Sí, devolver ${price}` : "Sí, registrar"}
                  </button>
                  <button key="volver" type="button" onClick={() => setConfirming(false)} disabled={pending} className={buttonClass("ghost")}>
                    Cambiar algo
                  </button>
                </>
              ) : (
                <button key="devolver" type="button" disabled={!ready} onClick={() => setConfirming(true)} className={cn(buttonClass("primary"), "flex-1")}>
                  {method === "culqi" ? `Devolver ${ready ? price : ""}` : `Registrar devolución${ready ? ` de ${price}` : ""}`}
                </button>
              )}
            </div>
          </div>
        }
      >
        <form id={formId} action={action} className="space-y-6 p-4" onChange={() => setConfirming(false)}>
          <dl className="space-y-1 rounded-xl bg-raised p-4 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Pagó</dt>
              <dd>{formatPrice(options.paidCents)}</dd>
            </div>
            {options.refundedCents ? (
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Ya devuelto</dt>
                <dd>{formatPrice(options.refundedCents)}</dd>
              </div>
            ) : null}
            <div className="flex justify-between gap-3 font-semibold">
              <dt>Puedes devolver</dt>
              <dd>{formatPrice(options.availableCents)}</dd>
            </div>
          </dl>

          <ReasonPicker
            value={reason}
            onChange={(r) => {
              setReason(r);
              setConfirming(false);
            }}
          />

          {reason === "agotado" ? (
            options.items.length ? (
              <SoldOutPicker items={options.items} selected={selected} onChange={pickSoldOut} />
            ) : (
              <p className="text-sm text-muted">Todas las prendas de este pedido ya se devolvieron por agotadas.</p>
            )
          ) : null}

          <fieldset className="min-w-0">
            <legend className="mb-1.5 text-sm font-medium">¿Cuánto?</legend>
            <div role="radiogroup" aria-label="¿Cuánto?" className="grid grid-cols-2 gap-2">
              {(["todo", "monto"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={mode === m}
                  onClick={() => {
                    setMode(m);
                    setConfirming(false);
                  }}
                  className={cn(
                    "min-h-11 rounded-xl border px-3 py-2 text-sm font-semibold transition",
                    mode === m ? "border-white bg-white text-black" : "border-line bg-raised text-muted hover:text-white",
                  )}
                >
                  {m === "todo" ? `Todo (${formatPrice(max)})` : "Un monto"}
                </button>
              ))}
            </div>
            <input type="hidden" name="amountMode" value={mode} />
            {mode === "monto" ? (
              <label className="mt-3 block">
                <span className="sr-only">Monto en soles</span>
                <span className="relative block">
                  <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-muted">S/</span>
                  <input
                    name="amount"
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="0.00"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    aria-invalid={!!amountError}
                    className={cn(inputClass, "pl-11")}
                  />
                </span>
                {amountError ? <span className="mt-1.5 block text-sm text-danger">{amountError}</span> : null}
              </label>
            ) : null}
          </fieldset>

          {options.culqi ? (
            <fieldset className="min-w-0">
              <legend className="mb-1.5 text-sm font-medium">¿Cómo se devuelve?</legend>
              <div className="space-y-2">
                {(["culqi", "manual"] as const).map((m) => (
                  <label key={m} className="flex min-h-12 cursor-pointer items-start gap-3 rounded-xl border border-line p-3 has-checked:border-white">
                    <input
                      type="radio"
                      name="method"
                      value={m}
                      checked={method === m}
                      onChange={() => {
                        setMethod(m);
                        setConfirming(false);
                      }}
                      className="mt-0.5 size-5 shrink-0 accent-white"
                    />
                    <span className="text-sm">
                      <span className="block font-medium">{m === "culqi" ? "Por Culqi" : "Ya se lo devolví por mi cuenta"}</span>
                      <span className="block text-xs text-muted">
                        {m === "culqi"
                          ? `Vuelve a la ${options.culqi!.method === "yape" ? "cuenta de Yape" : "tarjeta"} con que pagó.`
                          : "Por Yape, Plin o transferencia. Aquí solo se registra (por ejemplo, si Culqi no lo permite)."}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          ) : (
            <p className="rounded-xl border border-line p-3 text-sm text-muted">
              Este pedido no se pagó por Culqi: devuélvele el dinero por Yape, Plin o transferencia y regístralo aquí para que quede en el pedido.
              <input type="hidden" name="method" value="manual" />
            </p>
          )}

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">
              Nota interna{" "}
              <span className="font-normal text-subtle">{reason === "otro" ? "(escribe el motivo)" : "(opcional, solo la ve el equipo)"}</span>
            </span>
            <input name="note" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej. Se manchó en el almacén" className={inputClass} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">
              Mensaje para el cliente <span className="font-normal text-subtle">(opcional, lo ve en {emailEnabled ? "el email y en " : ""}la página de su pedido)</span>
            </span>
            <textarea
              name="customerMessage"
              maxLength={1000}
              rows={2}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Ej. Te devolvimos el polo negro: lo repondremos la próxima semana."
              className={cn(inputClass, "h-auto py-3")}
            />
          </label>
          {emailEnabled ? <Toggle name="notifyCustomer" defaultChecked label="Avisar al cliente por email" hint="Le llega un email con el monto devuelto y el motivo." /> : null}
          <FormAlert state={state} />
        </form>
      </Sheet>
    </div>
  );
}

/** Devolución que Culqi no confirmó: el admin revisa CulqiPanel y dice si se hizo. */
export function PendingRefundActions({ orderId, refundId }: { orderId: string; refundId: string }) {
  const [state, action, pending] = useActionState((_: ActionState, formData: FormData) => resolveRefundAction(orderId, refundId, formData.get("done") === "1"), idle);
  return (
    <form action={action} className="mt-3 space-y-2">
      <div className="flex flex-wrap gap-2">
        <button type="submit" name="done" value="1" disabled={pending} className={buttonClass("secondary")}>
          Sí se hizo
        </button>
        <button type="submit" name="done" value="0" disabled={pending} className={buttonClass("ghost")}>
          No se hizo
        </button>
      </div>
      <FormAlert state={state} />
    </form>
  );
}
