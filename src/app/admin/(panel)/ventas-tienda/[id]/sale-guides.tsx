"use client";

import { FileText, RotateCw, Truck } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { Badge, buttonClass, formatDateTime } from "@/components/admin/ui";
import { formatDocNumber } from "@/lib/pos";
import type { SaleGuide } from "@/server/services/dispatch-guides";
import { retryGuideAction } from "./guia/actions";

const STATUS = {
  aceptado: { tone: "success", label: "Aceptada por SUNAT" },
  pendiente: { tone: "warning", label: "Pendiente en SUNAT" },
  rechazado: { tone: "danger", label: "Rechazada" },
} as const;

/** Las guías de remisión de la venta, con su PDF; y el botón para hacer otra (`canCreate`: boleta o factura aceptada). */
export function SaleGuides({ saleId, guides, canCreate }: { saleId: string; guides: SaleGuide[]; canCreate: boolean }) {
  if (!guides.length && !canCreate) return null;
  return (
    <section id="guias" aria-label="Guías de remisión" className="scroll-mt-24 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Guías de remisión</h2>
        {canCreate ? (
          <Link href={`/admin/ventas-tienda/${saleId}/guia`} className={buttonClass("secondary", "sm")}>
            <Truck className="size-4" aria-hidden /> {guides.length ? "Otra guía" : "Generar guía de remisión"}
          </Link>
        ) : null}
      </div>
      {guides.map((g) => (
        <GuideRow key={g.id} guide={g} />
      ))}
    </section>
  );
}

function GuideRow({ guide }: { guide: SaleGuide }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const info = STATUS[guide.sunatStatus];
  return (
    <div className="space-y-2 rounded-2xl border border-line p-4 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono font-semibold">{formatDocNumber(guide.series, guide.number)}</span>
        <Badge tone={info.tone}>{info.label}</Badge>
        <span className="text-xs text-subtle">
          {formatDateTime(guide.createdAt)} · traslado {guide.transferDate.split("-").reverse().join("/")} · {guide.transportMode === "01" ? (guide.carrierName ?? "Transporte público") : "Transporte propio"}
        </span>
      </div>
      <p className="text-muted">
        A {guide.recipientName} · {guide.destinationAddress}
      </p>
      {guide.sunatMessage && guide.sunatStatus !== "aceptado" ? <p className="text-muted">{guide.sunatMessage}</p> : null}
      {error ? <p className="text-danger">{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        {guide.sunatPdfUrl ? (
          <a href={guide.sunatPdfUrl} target="_blank" rel="noopener noreferrer" className={buttonClass("primary", "sm")}>
            <FileText className="size-4" aria-hidden /> Ver e imprimir (PDF)
          </a>
        ) : null}
        {guide.sunatStatus === "pendiente" ? (
          <button type="button" disabled={pending} onClick={() => start(async () => setError(await retryGuideAction(guide.id)))} className={buttonClass("secondary", "sm")}>
            <RotateCw className="size-4" aria-hidden /> {pending ? "Consultando…" : guide.sunatSubmitted ? "Consultar en SUNAT" : "Reintentar envío"}
          </button>
        ) : null}
      </div>
    </div>
  );
}
