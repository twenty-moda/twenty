"use client";

import { Smartphone } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { cn } from "@/lib/cn";

/**
 * Instalar la web como app (manifest en public/tienda.webmanifest y public/panel.webmanifest). Chrome avisa con
 * `beforeinstallprompt`; Safari de iPhone y iPad no avisa: se instala desde Compartir → «Agregar a inicio».
 */
type InstallPromptEvent = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

// Se escucha al cargar el módulo (antes de hidratar): Chrome manda el aviso una sola vez, apenas carga la página.
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    // Sin esto Chrome de Android muestra su propia barra abajo, encima de las barras fijas de la tienda.
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    notify();
  });
}

const subscribe = (onChange: () => void) => {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
};

const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
// El iPad con iPadOS se presenta como Mac: se reconoce por la pantalla táctil.
const isApple = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);

type Mode = "none" | "prompt" | "apple";
const readMode = (): Mode => (isStandalone() ? "none" : deferred ? "prompt" : isApple() ? "apple" : "none");

/** Para la tienda: solo carga este módulo, así Chrome no muestra su barra de «Instalar» (se instala desde su menú). */
export function QuietInstallPrompt() {
  return null;
}

/** «Instalar como app» en el menú del panel. No aparece si ya está instalada o si el navegador no deja instalarla. */
export function InstallAppButton({ className }: { className?: string }) {
  const mode = useSyncExternalStore(subscribe, readMode, () => "none" as Mode);
  const [help, setHelp] = useState(false);
  // Si se instaló por el menú del navegador, la pestaña ya abierta deja de ofrecerlo.
  useEffect(() => {
    const media = window.matchMedia("(display-mode: standalone)");
    media.addEventListener("change", notify);
    return () => media.removeEventListener("change", notify);
  }, []);

  if (mode === "none") return null;

  const install = async () => {
    if (mode === "apple") return setHelp((h) => !h);
    const event = deferred;
    if (!event) return;
    await event.prompt();
    await event.userChoice;
    // Chrome no deja volver a usar el mismo aviso: si lo cerró, vuelve a ofrecerlo más adelante.
    deferred = null;
    notify();
  };

  return (
    <div>
      <button type="button" onClick={install} aria-expanded={mode === "apple" ? help : undefined} className={cn("flex h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm text-muted hover:bg-raised hover:text-white", className)}>
        <Smartphone className="size-[18px]" aria-hidden /> Instalar como app
      </button>
      {mode === "apple" && help ? (
        <p className="mx-3 mb-2 rounded-xl bg-raised px-3 py-2.5 text-xs leading-relaxed text-muted">
          En Safari, toca <strong className="text-white">Compartir</strong> (el cuadrado con la flecha hacia arriba) y elige <strong className="text-white">Agregar a inicio</strong>. Queda el ícono «TWENTY Panel»; la primera vez hay que entrar con tu usuario.
        </p>
      ) : null}
    </div>
  );
}
