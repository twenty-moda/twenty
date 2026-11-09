"use client";

// Solo importa el módulo: así Chrome de Android no saca su barra de «Instalar» en la tienda (se instala desde su menú).
import "@/lib/install-prompt";

export function QuietInstallPrompt() {
  return null;
}
