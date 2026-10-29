"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";

/**
 * Imprimir solo una hoja (etiquetas, ticket) y no el panel: `print()` monta la hoja en <body> y abre el diálogo
 * cuando las fuentes están listas (si no, la térmica sale con la tipografía de respaldo); al cerrar se desmonta.
 * La regla `body:has(> .print-sheet)` de globals.css esconde todo lo demás.
 */
export function usePrintSheet() {
  const [printing, setPrinting] = useState(false);
  useEffect(() => {
    if (!printing) return;
    const done = () => setPrinting(false);
    window.addEventListener("afterprint", done);
    let cancelled = false;
    document.fonts.ready.then(() => requestAnimationFrame(() => !cancelled && window.print()));
    return () => {
      cancelled = true;
      window.removeEventListener("afterprint", done);
    };
  }, [printing]);
  return { printing, print: () => setPrinting(true) };
}

/** `page`: la regla @page de la hoja (medida del papel). */
export function PrintSheet({ page, className, children }: { page: string; className?: string; children: ReactNode }) {
  return createPortal(
    <div className={cn("print-sheet", className)}>
      <style>{page}</style>
      {children}
    </div>,
    document.body,
  );
}
