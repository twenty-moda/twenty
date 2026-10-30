"use client";

import { Printer, RotateCw } from "lucide-react";
import { useState, useTransition, type ReactNode } from "react";
import { Badge, buttonClass } from "@/components/admin/ui";
import type { PosSaleDetail } from "@/server/services/pos";
import type { SaleReturn } from "@/server/services/pos-returns";
import { retrySunatAction } from "../pos/actions";
import { retryReturnSunatAction } from "./actions";

const STATUS = {
  aceptado: { tone: "success", label: "Aceptada por SUNAT" },
  pendiente: { tone: "warning", label: "Pendiente en SUNAT" },
  rechazado: { tone: "danger", label: "Rechazada por SUNAT" },
} as const;

type SunatDocument = Pick<PosSaleDetail, "sunatStatus" | "sunatMessage" | "sunatTicketUrl" | "sunatPdfUrl" | "sunatXmlUrl" | "sunatCdrUrl">;

/**
 * Estado de la boleta o factura en SUNAT, con el ticket oficial (PDF de 80 mm de la API, con el QR y el hash) y el
 * reintento si quedó pendiente. `onUpdate`: el POS cambia la venta que muestra; en el detalle refresca la página.
 */
export function SunatStatus({ sale, onUpdate }: { sale: PosSaleDetail; onUpdate?: (sale: PosSaleDetail) => void }) {
  return (
    <SunatPanel
      doc={sale}
      label="Comprobante en SUNAT"
      printLabel={sale.documentType === "factura" ? "Imprimir factura" : "Imprimir boleta"}
      canRetry={sale.status === "pagada"}
      retry={async () => {
        const result = await retrySunatAction(sale.id);
        if (!result.ok) return result.message;
        onUpdate?.(result.sale);
        return null;
      }}
      badges={sale.sunatVoidStatus ? <Badge tone="neutral">Baja en SUNAT: {sale.sunatVoidStatus.toLowerCase()}</Badge> : null}
    />
  );
}

/** La nota de crédito de una devolución en SUNAT. */
export function CreditNoteStatus({ ret }: { ret: SaleReturn }) {
  return (
    <SunatPanel
      doc={ret}
      label="Nota de crédito en SUNAT"
      printLabel="Imprimir nota de crédito"
      canRetry
      retry={async () => {
        const result = await retryReturnSunatAction(ret.id);
        return result.ok ? null : result.message;
      }}
    />
  );
}

/** `retry` devuelve el error, o null si salió bien. */
function SunatPanel({ doc, label, printLabel, canRetry, retry, badges }: { doc: SunatDocument; label: string; printLabel: string; canRetry: boolean; retry: () => Promise<string | null>; badges?: ReactNode }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  if (!doc.sunatStatus) return null;
  const info = STATUS[doc.sunatStatus];

  return (
    <section aria-label={label} className="space-y-3 rounded-2xl border border-line p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={info.tone}>{info.label}</Badge>
        {badges}
      </div>
      {doc.sunatMessage ? <p className="text-sm text-muted">{doc.sunatMessage}</p> : null}
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <div className="flex flex-wrap items-center gap-2">
        {doc.sunatTicketUrl ? (
          <a href={doc.sunatTicketUrl} target="_blank" rel="noopener noreferrer" className={buttonClass("primary")}>
            <Printer className="size-4" aria-hidden /> {printLabel}
          </a>
        ) : null}
        {doc.sunatStatus !== "aceptado" && canRetry ? (
          <button type="button" onClick={() => startTransition(async () => setError(await retry()))} disabled={pending} className={buttonClass("secondary")}>
            <RotateCw className="size-4" aria-hidden /> {pending ? "Enviando…" : "Reintentar envío"}
          </button>
        ) : null}
        {doc.sunatPdfUrl ? (
          <a href={doc.sunatPdfUrl} target="_blank" rel="noopener noreferrer" className={buttonClass("ghost", "sm")}>
            A4
          </a>
        ) : null}
        {doc.sunatXmlUrl ? (
          <a href={doc.sunatXmlUrl} target="_blank" rel="noopener noreferrer" className={buttonClass("ghost", "sm")}>
            XML
          </a>
        ) : null}
        {doc.sunatCdrUrl ? (
          <a href={doc.sunatCdrUrl} target="_blank" rel="noopener noreferrer" className={buttonClass("ghost", "sm")}>
            CDR
          </a>
        ) : null}
      </div>
    </section>
  );
}
