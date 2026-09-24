"use client";

import { Check, Link2 } from "lucide-react";
import { useState } from "react";

export function CopyLinkButton({ className = "mt-3" }: { className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(window.location.href);
          setCopied(true);
          setTimeout(() => setCopied(false), 2500);
        } catch {
          // Sin permiso de portapapeles: el enlace sigue en la barra del navegador.
        }
      }}
      className={`${className} inline-flex h-11 items-center gap-2 rounded-full border border-line px-5 font-semibold`}
    >
      {copied ? <Check className="size-4 text-success" aria-hidden /> : <Link2 className="size-4" aria-hidden />}
      {copied ? "Enlace copiado" : "Copiar enlace"}
    </button>
  );
}
