"use client";

import { ImageUp, Loader2, MessageCircle } from "lucide-react";
import { useId, useState, useTransition } from "react";
import { uploadPaymentProofAction } from "@/app/(store)/pedido/[id]/actions";
import { cn } from "@/lib/cn";
import { resizeForUpload } from "@/lib/resize-image";

type PaymentProofUploadProps = {
  orderId: string;
  /** "light" dentro de la tarjeta blanca del QR; "dark" sobre el fondo de la tienda. */
  tone: "light" | "dark";
  label?: string;
  /** Botón con borde (para "sube otra"), en vez del botón lleno. */
  secondary?: boolean;
  /** Alternativa si no puede subirla (WhatsApp de la tienda con el mensaje listo). */
  whatsappHref: string | null;
};

/** Botón para subir la captura del pago con Yape/Plin. Al subirla, la página se actualiza ("Pago por verificar"). */
export function PaymentProofUpload({ orderId, tone, label = "Subir captura del pago", secondary = false, whatsappHref }: PaymentProofUploadProps) {
  const inputId = useId();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const upload = (file: File) => {
    setError(null);
    start(async () => {
      const fd = new FormData();
      fd.set("file", await resizeForUpload(file));
      const result = await uploadPaymentProofAction(orderId, fd).catch(() => ({ ok: false as const, message: "Se cortó la conexión. Vuelve a intentarlo." }));
      if (!result.ok) setError(result.message);
    });
  };

  return (
    <div className="mt-5">
      <input
        id={inputId}
        type="file"
        accept="image/*"
        className="sr-only"
        disabled={pending}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) upload(file);
        }}
      />
      <label
        htmlFor={inputId}
        aria-disabled={pending}
        className={cn(
          "flex cursor-pointer items-center justify-center gap-2 rounded-full px-4 transition active:scale-[0.98]",
          secondary ? "h-12 border border-line text-sm font-semibold hover:border-white/50" : "h-13 text-sm font-bold tracking-wide uppercase",
          !secondary && (tone === "light" ? "bg-black text-white" : "bg-white text-black"),
          pending && "pointer-events-none opacity-70",
        )}
      >
        {pending ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <ImageUp className="size-5" aria-hidden />}
        {pending ? "Subiendo captura…" : label}
      </label>
      {error ? (
        <p role="alert" className={cn("mt-3 text-sm", tone === "light" ? "text-red-700" : "text-danger")}>
          {error}
        </p>
      ) : null}
      {whatsappHref ? (
        <a
          href={whatsappHref}
          target="_blank"
          rel="noopener noreferrer"
          className={cn("mt-2 block py-2 text-center text-sm underline underline-offset-4", tone === "light" ? "text-black/70" : "text-muted")}
        >
          <MessageCircle className="mr-1.5 inline size-4 align-[-3px]" aria-hidden />
          ¿Problemas para subirla? Envíala por WhatsApp
        </a>
      ) : null}
    </div>
  );
}
