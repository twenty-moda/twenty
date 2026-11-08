"use client";

import { Printer } from "lucide-react";
import { useEffect } from "react";
import { CashReportTicket } from "@/components/admin/cash-report-ticket";
import { TICKET_PAGE, type TicketCompany } from "@/components/admin/pos-ticket";
import { PrintSheet, usePrintSheet } from "@/components/admin/print-sheet";
import { buttonClass } from "@/components/admin/ui";
import { cn } from "@/lib/cn";
import type { CashReport } from "@/server/services/cash-report";

/** Vista previa del reporte y el botón para imprimirlo en la ticketera (con `?imprimir=1`, se abre el diálogo solo). */
export function PrintCashReport({ report, company, printedAt, fontClass, autoPrint }: { report: CashReport; company: TicketCompany; printedAt: Date; fontClass: string; autoPrint: boolean }) {
  const { printing, print } = usePrintSheet();
  useEffect(() => {
    if (autoPrint) print();
    // Solo al entrar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="space-y-4">
      <button type="button" onClick={print} disabled={printing} className={cn(buttonClass("primary"), "h-12 px-6")}>
        <Printer className="size-5" aria-hidden /> Imprimir reporte
      </button>
      <div className={cn("w-fit rounded-lg bg-white py-2 shadow-lg", fontClass)}>
        <CashReportTicket report={report} company={company} printedAt={printedAt} />
      </div>
      {printing ? (
        <PrintSheet page={TICKET_PAGE} className={fontClass}>
          <CashReportTicket report={report} company={company} printedAt={printedAt} />
        </PrintSheet>
      ) : null}
    </div>
  );
}
