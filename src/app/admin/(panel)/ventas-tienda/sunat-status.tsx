"use client";

import { Printer, RotateCw } from "lucide-react";
import { useState, useTransition } from "react";
import { Badge, buttonClass } from "@/components/admin/ui";
import type { PosSaleDetail } from "@/server/services/pos";
import { retrySunatAction } from "../pos/actions";

const STATUS = {
  aceptado: { tone: "success", label: "Aceptada por SUNAT" },
  pendiente: { tone: "warning", label: "Pendiente en SUNAT" },
  rechazado: { tone: "danger", label: "Rechazada por SUNAT" },
} as const;

/**
 * Estado de la boleta o factura en SUNAT, con el ticket oficial (PDF de 80 mm de la API, con el QR y el hash) y el
 * reintento si quedó pendiente. `onUpdate`: el POS cambia la venta que muestra; en el detalle refresca la página.
 */
export function SunatStatus({ sale, onUpdate }: { sale: PosSaleDetail; onUpdate?: (sale: PosSaleDetail) => void }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  if (!sale.sunatStatus) return null;
  const info = STATUS[sale.sunatStatus];
  const retry = () =>
    startTransition(async () => {
      const result = await retrySunatAction(sale.id);
      if (!result.ok) return setError(result.message);
      setError(null);
      onUpdate?.(result.sale);
    });

  return (
    <section aria-label="Comprobante en SUNAT" className="space-y-3 rounded-2xl border border-line p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={info.tone}>{info.label}</Badge>
        {sale.sunatVoidStatus ? <Badge tone="neutral">Baja en SUNAT: {sale.sunatVoidStatus.toLowerCase()}</Badge> : null}
      </div>
      {sale.sunatMessage ? <p className="text-sm text-muted">{sale.sunatMessage}</p> : null}
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <div className="flex flex-wrap items-center gap-2">
        {sale.sunatTicketUrl ? (
          <a href={sale.sunatTicketUrl} target="_blank" rel="noopener noreferrer" className={buttonClass("primary")}>
            <Printer className="size-4" aria-hidden /> Imprimir {sale.documentType === "factura" ? "factura" : "boleta"}
          </a>
        ) : null}
        {sale.sunatStatus !== "aceptado" && sale.status === "pagada" ? (
          <button type="button" onClick={retry} disabled={pending} className={buttonClass("secondary")}>
            <RotateCw className="size-4" aria-hidden /> {pending ? "Enviando…" : "Reintentar envío"}
          </button>
        ) : null}
        {sale.sunatPdfUrl ? (
          <a href={sale.sunatPdfUrl} target="_blank" rel="noopener noreferrer" className={buttonClass("ghost", "sm")}>
            A4
          </a>
        ) : null}
        {sale.sunatXmlUrl ? (
          <a href={sale.sunatXmlUrl} target="_blank" rel="noopener noreferrer" className={buttonClass("ghost", "sm")}>
            XML
          </a>
        ) : null}
        {sale.sunatCdrUrl ? (
          <a href={sale.sunatCdrUrl} target="_blank" rel="noopener noreferrer" className={buttonClass("ghost", "sm")}>
            CDR
          </a>
        ) : null}
      </div>
    </section>
  );
}
