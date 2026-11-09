"use client";

import { Share, Smartphone, X } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { buttonClass } from "@/components/admin/ui";
import { cn } from "@/lib/cn";
import { promptInstall, subscribeInstall, useInstallMode } from "@/lib/install-prompt";

/** Safari no tiene botón de instalar: se explica dónde tocar (en iOS 26 Compartir está dentro de «•••»). */
function AppleSteps({ className }: { className?: string }) {
  return (
    <p className={cn("text-xs leading-relaxed text-muted", className)}>
      En Safari toca <strong className="text-white">Compartir</strong> <Share className="inline size-3.5 align-[-2px] text-white" aria-hidden /> (si no lo ves, está en el menú{" "}
      <strong className="text-white">•••</strong>) y elige <strong className="text-white">Agregar a inicio</strong>. La primera vez hay que entrar con tu usuario.
    </p>
  );
}

/** «Instalar como app» en el menú del panel. No aparece si ya está instalada o si el navegador no deja instalarla. */
export function InstallAppButton({ className }: { className?: string }) {
  const mode = useInstallMode();
  const [help, setHelp] = useState(false);
  if (mode === "none") return null;

  return (
    <div>
      <button
        type="button"
        onClick={() => (mode === "apple" ? setHelp((h) => !h) : void promptInstall())}
        aria-expanded={mode === "apple" ? help : undefined}
        className={cn("flex h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm text-muted hover:bg-raised hover:text-white", className)}
      >
        <Smartphone className="size-[18px]" aria-hidden /> Instalar como app
      </button>
      {mode === "apple" && help ? <AppleSteps className="mx-3 mb-2 rounded-xl bg-raised px-3 py-2.5" /> : null}
    </div>
  );
}

// Cada equipo ve el aviso hasta que la instala; con «Ahora no» vuelve a salir a los 3 días.
const NOTICE_KEY = "twenty-app-aviso";
const NOTICE_AGAIN_MS = 3 * 24 * 60 * 60 * 1000;
function rememberNotice(value: "listo" | number) {
  try {
    localStorage.setItem(NOTICE_KEY, String(value));
  } catch {
    // Sin localStorage vuelve a salir en la próxima visita.
  }
}
const noticeDue = () => {
  try {
    const saved = localStorage.getItem(NOTICE_KEY);
    return saved !== "listo" && (saved === null || Date.now() - Number(saved) >= NOTICE_AGAIN_MS);
  } catch {
    return true;
  }
};

/**
 * Ventana que avisa al equipo que el panel ya se instala como app (pedido del usuario, 09/11/2026). No es modal ni
 * toma el foco: la pistola sigue escribiendo en el buscador del punto de venta aunque el aviso esté abierto.
 */
export function InstallAppNotice({ side = "right" }: { side?: "left" | "right" }) {
  const mode = useInstallMode();
  const due = useSyncExternalStore(subscribeInstall, noticeDue, () => false);
  const [ready, setReady] = useState(false);
  const [closed, setClosed] = useState(false);
  // Sale un momento después de cargar, para no tapar la página mientras aparece.
  useEffect(() => {
    const timer = setTimeout(() => setReady(true), 1500);
    return () => clearTimeout(timer);
  }, []);

  if (mode === "none" || !due || !ready || closed) return null;

  const close = (value: "listo" | number) => {
    rememberNotice(value);
    setClosed(true);
  };
  // Si cierra el aviso de Chrome sin instalar, cuenta como «Ahora no».
  const install = async () => close((await promptInstall()) ? "listo" : Date.now());

  return (
    <section
      role="dialog"
      aria-modal="false"
      aria-labelledby="install-app-title"
      className={cn(
        "fixed inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-50 rounded-2xl border border-line bg-surface p-4 shadow-2xl shadow-black/70 transition duration-300 motion-reduce:transition-none starting:translate-y-4 starting:opacity-0 sm:w-96",
        side === "right" ? "sm:left-auto" : "sm:right-auto",
      )}
    >
      <button type="button" aria-label="Cerrar el aviso" onClick={() => close(Date.now())} className="absolute top-2 right-2 grid size-10 place-items-center rounded-full text-muted hover:text-white">
        <X className="size-4" aria-hidden />
      </button>
      <div className="flex gap-3 pr-8">
        {/* eslint-disable-next-line @next/next/no-img-element -- ícono fijo de 48 px que ya está en public/icons */}
        <img src="/icons/panel-192.png" alt="" width={48} height={48} className="size-12 shrink-0 rounded-xl" />
        <div className="min-w-0">
          <h2 id="install-app-title" className="font-bold">
            Nuevo: el panel ya es una app
          </h2>
          <p className="mt-0.5 text-sm text-muted">Agrégala a tu celular, tablet o computadora: se abre con un toque, a pantalla completa y con la cámara lista para leer etiquetas.</p>
        </div>
      </div>
      {mode === "apple" ? <AppleSteps className="mt-3 rounded-xl bg-raised px-3 py-2.5" /> : null}
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <button type="button" onClick={() => close(Date.now())} className={buttonClass("ghost")}>
          Ahora no
        </button>
        {mode === "prompt" ? (
          <button type="button" onClick={install} className={buttonClass("primary")}>
            <Smartphone className="size-4" aria-hidden /> Instalar
          </button>
        ) : (
          <button type="button" onClick={() => close("listo")} className={buttonClass("primary")}>
            Ya la agregué
          </button>
        )}
      </div>
    </section>
  );
}
