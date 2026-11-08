"use client";

import { Ban, MessageCircle, Pencil, Printer, ScanBarcode } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { FormAlert } from "@/components/admin/form-controls";
import { PrintSheet, usePrintSheet } from "@/components/admin/print-sheet";
import { A4_PAGE, QuoteSheet, type QuoteCompany } from "@/components/admin/quote-sheet";
import { buttonClass } from "@/components/admin/ui";
import { idle, type ActionState } from "@/lib/action-state";
import { cn } from "@/lib/cn";
import type { QuoteDetail } from "@/server/services/quotes";
import { voidQuoteAction } from "../actions";

type Props = { quote: QuoteDetail; company: QuoteCompany; formattedNumber: string; fontClass: string; whatsappHref: string | null; open: boolean };

/** Imprimir (o guardar en PDF desde el diálogo), mandar por WhatsApp, vender en el punto de venta, editar y anular. */
export function QuoteActions({ quote, company, formattedNumber, fontClass, whatsappHref, open }: Props) {
  const { printing, print } = usePrintSheet();
  const [confirming, setConfirming] = useState(false);
  const [state, setState] = useState<ActionState>(idle);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {open ? (
          <Link href={`/admin/pos?cotizacion=${quote.number}`} className={buttonClass("primary")}>
            <ScanBarcode className="size-4" aria-hidden /> Vender en el punto de venta
          </Link>
        ) : null}
        <button type="button" onClick={print} disabled={printing} className={buttonClass("secondary")}>
          <Printer className="size-4" aria-hidden /> Imprimir o guardar PDF
        </button>
        {whatsappHref ? (
          <a href={whatsappHref} target="_blank" rel="noopener noreferrer" className={buttonClass("secondary")}>
            <MessageCircle className="size-4" aria-hidden /> WhatsApp
          </a>
        ) : null}
        {open ? (
          <Link href={`/admin/cotizaciones/${quote.number}/editar`} className={buttonClass("ghost")}>
            <Pencil className="size-4" aria-hidden /> Editar
          </Link>
        ) : null}
        {open ? (
          confirming ? (
            <button key="confirm" type="button" disabled={pending} onClick={() => start(async () => setState(await voidQuoteAction(quote.id)))} className={buttonClass("danger")}>
              {pending ? "Anulando…" : "Sí, anular la cotización"}
            </button>
          ) : (
            <button key="ask" type="button" onClick={() => setConfirming(true)} className={cn(buttonClass("ghost"), "hover:text-danger")}>
              <Ban className="size-4" aria-hidden /> Anular
            </button>
          )
        ) : null}
      </div>
      <FormAlert state={state} />
      {printing ? (
        <PrintSheet page={A4_PAGE} className={fontClass}>
          <QuoteSheet quote={quote} company={company} formattedNumber={formattedNumber} />
        </PrintSheet>
      ) : null}
    </div>
  );
}
