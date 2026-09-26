"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { cn } from "@/lib/cn";

type SheetProps = {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  /**
   * En móvil "bottom" sube desde abajo y "top" baja desde arriba (para paneles que abren el teclado:
   * desde abajo el teclado los taparía). En escritorio todos los paneles salen de un costado.
   */
  side?: "left" | "right" | "bottom" | "top";
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
};

// La animación de entrada y salida está en globals.css (dialog.sheet), según data-side.
const sides = {
  left: "mr-auto h-dvh w-[88vw] max-w-sm",
  right: "ml-auto h-dvh w-full max-w-md",
  bottom: "mt-auto w-full max-h-[88dvh] rounded-t-2xl md:mt-0 md:ml-auto md:h-dvh md:max-h-none md:max-w-md md:rounded-none",
  // --sheet-visible-h = alto que deja el teclado (ver el efecto de abajo): el panel no se mete debajo.
  top: "mb-auto w-full max-h-[min(88dvh,var(--sheet-visible-h,88dvh))] rounded-b-2xl md:mb-0 md:ml-auto md:h-dvh md:max-h-none md:max-w-md md:rounded-none",
};

/**
 * Panel lateral / inferior sobre <dialog> nativo: trae foco atrapado, cierre con Esc y capa inerte.
 * Se cierra también tocando el fondo.
 */
export function Sheet({ open, onClose, title, side = "right", footer, children, className }: SheetProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // En el teléfono el teclado no achica la página (ni dvh): solo el visualViewport sabe cuánto queda a la vista.
  useEffect(() => {
    const dialog = ref.current;
    const viewport = window.visualViewport;
    if (side !== "top" || !open || !dialog || !viewport) return;
    const update = () => dialog.style.setProperty("--sheet-visible-h", `${viewport.height}px`);
    update();
    viewport.addEventListener("resize", update);
    return () => {
      viewport.removeEventListener("resize", update);
      dialog.style.removeProperty("--sheet-visible-h");
    };
  }, [open, side]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      data-side={side}
      className={cn(
        "sheet fixed inset-0 z-50 m-0 max-w-none bg-surface p-0 text-white backdrop:bg-black/70",
        sides[side],
        className,
      )}
    >
      {/* h-full solo donde el panel tiene alto fijo (h-dvh). Arriba y abajo en el teléfono el alto sale del
          contenido, y ahí Safari de iPhone resuelve h-full como 0: el panel se abría sin verse. */}
      <div className={cn("flex max-h-[inherit] flex-col", side === "left" || side === "right" ? "h-full" : "md:h-full")}>
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-line pl-4 pr-1">
          <h2 id={titleId} className="text-sm font-semibold tracking-widest uppercase">
            {title}
          </h2>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="grid size-12 place-items-center">
            <X className="size-5" aria-hidden />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto overscroll-contain">{children}</div>
        {footer ? <footer className="shrink-0 border-t border-line px-4 pt-3 pb-safe">{footer}</footer> : null}
      </div>
    </dialog>
  );
}
