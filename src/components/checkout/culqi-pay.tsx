"use client";

import { CreditCard, Loader2, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import Script from "next/script";
import { useEffect, useRef, useState } from "react";
import { payWithCulqiAction } from "@/app/(store)/pedido/[id]/actions";
import { formatPrice } from "@/lib/money";

type CulqiToken = { id: string; email?: string };
type CulqiInstance = {
  open(): void;
  close(): void;
  culqi?: () => void;
  token?: CulqiToken | null;
  error?: { user_message?: string } | null;
};
type Culqi3DSApi = {
  publicKey: string;
  settings: unknown;
  options: unknown;
  generateDevice(): Promise<string | null>;
  initAuthentication(tokenId: string): void;
  reset(): void;
};
declare global {
  interface Window {
    CulqiCheckout?: new (publicKey: string, config: unknown) => CulqiInstance;
    Culqi3DS?: Culqi3DSApi;
  }
}

type CulqiPayProps = { orderId: string; orderNumber: number; amountCents: number; email: string; publicKey: string; autoOpen: boolean };

/**
 * Botón de pago con Culqi (tarjeta o Yape). Flujo: Culqi Checkout da un token → el servidor crea el cargo →
 * si el banco pide 3-D Secure, Culqi3DS valida y se reintenta el cargo con esos datos.
 */
export function CulqiPay({ orderId, orderNumber, amountCents, email, publicKey, autoOpen }: CulqiPayProps) {
  const router = useRouter();
  const [ready, setReady] = useState({ checkout: false, tds: false });
  const [status, setStatus] = useState<"idle" | "processing" | "verifying" | "paid">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const token = useRef<CulqiToken | null>(null);
  const device = useRef<string | null>(null);
  const opened = useRef(false);

  const charge = async (authentication3DS?: unknown) => {
    if (!token.current) return;
    setStatus("processing");
    const result = await payWithCulqiAction({
      orderId,
      tokenId: token.current.id,
      email: token.current.email || email,
      deviceId: device.current,
      authentication3DS: authentication3DS ?? null,
    });
    if (result.status === "paid") {
      setStatus("paid");
      window.Culqi3DS?.reset();
      router.refresh();
    } else if (result.status === "review") {
      setStatus("verifying");
      const tds = window.Culqi3DS!;
      tds.settings = { charge: { totalAmount: amountCents, returnUrl: window.location.href, currency: "PEN" }, card: { email: token.current.email || email } };
      tds.options = { showModal: true, showLoading: true, showIcon: true, closeModalAction: () => setStatus("idle") };
      tds.initAuthentication(token.current.id);
    } else {
      setStatus("idle");
      setMessage(result.message);
      window.Culqi3DS?.reset();
    }
  };
  const chargeRef = useRef(charge);
  useEffect(() => {
    chargeRef.current = charge;
  });

  // Respuesta de 3-D Secure: llega como mensaje del iframe de Culqi.
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const data = (event.data ?? {}) as { parameters3DS?: unknown; error?: unknown };
      if (data.parameters3DS) chargeRef.current(data.parameters3DS);
      if (data.error) {
        setStatus("idle");
        setMessage("Tu banco no pudo validar la tarjeta. Intenta de nuevo o paga con Yape.");
        window.Culqi3DS?.reset();
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const open = async () => {
    setMessage(null);
    const Checkout = window.CulqiCheckout;
    if (!Checkout) {
      setMessage("La pasarela todavía está cargando. Intenta en unos segundos.");
      return;
    }
    if (window.Culqi3DS) {
      window.Culqi3DS.publicKey = publicKey;
      device.current = await window.Culqi3DS.generateDevice().catch(() => null);
    }
    const culqi = new Checkout(publicKey, {
      settings: { title: "TWENTY", currency: "PEN", amount: amountCents },
      client: { email },
      options: {
        lang: "es",
        installments: false,
        modal: true,
        paymentMethods: { tarjeta: true, yape: true, billetera: false, bancaMovil: false, agente: false, cuotealo: false },
        paymentMethodsSort: ["tarjeta", "yape"],
      },
      appearance: {
        theme: "default",
        menuType: "sidebar",
        buttonCardPayText: "Pagar",
        defaultStyle: { bannerColor: "#000000", buttonBackground: "#000000", menuColor: "#000000", linksColor: "#000000", buttonTextColor: "#FFFFFF", priceColor: "#000000" },
      },
    });
    culqi.culqi = () => {
      if (culqi.token) {
        token.current = culqi.token;
        culqi.close();
        void chargeRef.current();
      } else if (culqi.error) {
        setMessage(culqi.error.user_message ?? "No se pudo procesar el pago.");
      }
    };
    culqi.open();
  };

  // Al llegar desde el checkout se abre la pasarela sola, una vez.
  useEffect(() => {
    if (autoOpen && ready.checkout && ready.tds && !opened.current) {
      opened.current = true;
      void open();
    }
  });

  if (status === "paid") {
    return <p className="rounded-2xl bg-success/15 p-5 text-center font-semibold text-success">¡Pago recibido! Actualizando tu pedido…</p>;
  }

  const busy = status === "processing" || status === "verifying";
  return (
    <section className="rounded-2xl bg-white p-6 text-center text-black">
      <Script src="https://js.culqi.com/checkout-js" strategy="afterInteractive" onReady={() => setReady((r) => ({ ...r, checkout: true }))} />
      <Script src="https://3ds.culqi.com" strategy="afterInteractive" onReady={() => setReady((r) => ({ ...r, tds: true }))} />
      <h2 className="text-lg font-bold">Paga tu pedido #{orderNumber}</h2>
      <p className="mt-1 text-sm text-black/70">Con tarjeta (Visa, Mastercard, Amex) o Yape.</p>
      <button
        type="button"
        onClick={() => void open()}
        disabled={busy || !ready.checkout}
        className="mt-5 flex h-13 w-full items-center justify-center gap-2 rounded-full bg-black text-sm font-bold tracking-wide text-white uppercase disabled:opacity-60"
      >
        {busy ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <CreditCard className="size-5" aria-hidden />}
        {status === "verifying" ? "Validando con tu banco…" : status === "processing" ? "Procesando pago…" : `Pagar ${formatPrice(amountCents)}`}
      </button>
      {message ? (
        <p role="alert" className="mt-3 text-sm font-medium text-danger">
          {message}
        </p>
      ) : null}
      <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-black/60">
        <ShieldCheck className="size-4" aria-hidden /> Pago seguro procesado por Culqi. TWENTY no ve los datos de tu tarjeta.
      </p>
    </section>
  );
}
