"use client";

import { Printer } from "lucide-react";

export function PrintButton({ label = "Imprimir o guardar PDF" }: { label?: string }) {
  return (
    <button type="button" onClick={() => window.print()} className="inline-flex h-12 items-center gap-2 rounded-full bg-white px-6 text-sm font-bold text-black print:hidden">
      <Printer className="size-4" aria-hidden /> {label}
    </button>
  );
}
