"use client";

import { useEffect, useSyncExternalStore } from "react";

/**
 * Instalar la web como app (manifest en public/tienda.webmanifest y public/panel.webmanifest). Chrome avisa con
 * `beforeinstallprompt`; Safari de iPhone y iPad no avisa: se instala desde Compartir → «Agregar a inicio».
 * La tienda carga este módulo solo para que Chrome no saque su barra; el panel lo usa en `components/admin/install-app.tsx`.
 */
type InstallPromptEvent = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

// Se escucha al cargar el módulo (antes de hidratar): Chrome manda el aviso una sola vez, apenas carga la página.
// Una vez instalada, Chrome ya no lo manda.
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

export const subscribeInstall = (onChange: () => void) => {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
};

const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
// El iPad con iPadOS se presenta como Mac: se reconoce por la pantalla táctil.
const isApple = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);

/** `prompt`: con el aviso de Chrome; `apple`: con los pasos de Safari; `none`: ya está instalada o no se puede. */
export type InstallMode = "none" | "prompt" | "apple";
const readMode = (): InstallMode => (isStandalone() ? "none" : deferred ? "prompt" : isApple() ? "apple" : "none");

export function useInstallMode(): InstallMode {
  const mode = useSyncExternalStore(subscribeInstall, readMode, () => "none" as InstallMode);
  // Si se instaló por el menú del navegador, la pestaña ya abierta deja de ofrecerlo.
  useEffect(() => {
    const media = window.matchMedia("(display-mode: standalone)");
    media.addEventListener("change", notify);
    return () => media.removeEventListener("change", notify);
  }, []);
  return mode;
}

/** Abre el aviso de instalar de Chrome. Devuelve si la instaló. */
export async function promptInstall(): Promise<boolean> {
  const event = deferred;
  if (!event) return false;
  await event.prompt();
  const { outcome } = await event.userChoice;
  // Chrome no deja volver a usar el mismo aviso: si lo cerró, vuelve a ofrecerlo más adelante.
  deferred = null;
  notify();
  return outcome === "accepted";
}
