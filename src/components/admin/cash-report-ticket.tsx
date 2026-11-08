import { formatPrice } from "@/lib/money";
import { PAYMENT_LABEL, POS_DOCUMENT_LABEL } from "@/lib/pos";
import type { CashReport, CashReportLine } from "@/server/services/cash-report";
import { ticketDate, ticketDisplay, TicketRow, ticketRule, type TicketCompany } from "./pos-ticket";

const KIND_LABEL: Record<CashReportLine["kind"], string> = {
  venta: "Venta",
  virtual: "Virtual",
  anulada: "Anulada",
  devolucion: "Devolución",
  gasto: "Gasto",
  ingreso: "Ingreso",
  egreso: "Egreso",
};

const signed = (cents: number) => (cents < 0 ? `-${formatPrice(-cents)}` : formatPrice(cents));
const when = (d: Date | string) => ticketDate.format(new Date(d)).replace(",", "");

function Title({ children }: { children: string }) {
  return <div style={{ textAlign: "center", fontWeight: 700, margin: "2.5mm 0 1mm", letterSpacing: "0.05em" }}>== {children} ==</div>;
}

/**
 * Reporte de caja en la ticketera de 80 mm, en el orden del de Insaga: datos de la caja, dinero en caja, formas de
 * pago, comprobantes y cada transacción. Solo negro, como el ticket de venta.
 */
export function CashReportTicket({ report, company, printedAt }: { report: CashReport; company: TicketCompany; printedAt: Date }) {
  const { session, lines, documents, methods } = report;
  const { totals } = session;
  const closed = session.closedAt !== null;
  const cash = closed ? session.expectedCashCents! : session.expectedNowCents;
  const diff = closed ? session.countedCashCents! - session.expectedCashCents! : null;
  return (
    <div style={{ width: "72mm", margin: "0 4mm", padding: "3mm 0 6mm", background: "#fff", color: "#000", fontFamily: "var(--font-plex-mono), ui-monospace, monospace", fontSize: "2.8mm", lineHeight: 1.35 }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ ...ticketDisplay, fontWeight: 900, fontSize: "8mm", lineHeight: 1, letterSpacing: "0.3em", paddingLeft: "0.3em" }}>TWENTY</div>
        <div style={{ ...ticketDisplay, marginTop: "1.5mm", fontWeight: 800, fontSize: "4.6mm", textTransform: "uppercase", letterSpacing: "0.08em" }}>Reporte de caja</div>
        <div style={{ fontWeight: 700 }}>Caja #{session.number}</div>
      </div>
      {ticketRule}
      {company.legalName ? <TicketRow label="Empresa" value={company.legalName} /> : null}
      {company.ruc ? <TicketRow label="RUC" value={company.ruc} /> : null}
      <TicketRow label="Establecimiento" value={session.warehouseName} />
      {session.warehouseAddress ? <div style={{ textAlign: "right" }}>{session.warehouseAddress}</div> : null}
      <TicketRow label="Vendedor" value={session.openedByName ?? "—"} />
      <TicketRow label="Apertura" value={when(session.openedAt)} />
      <TicketRow label="Estado" value={closed ? "Cerrada" : "Abierta"} />
      {closed ? <TicketRow label="Cierre" value={when(session.closedAt!)} /> : null}
      <TicketRow label="Fecha reporte" value={when(printedAt)} />

      <Title>DINERO EN CAJA</Title>
      <TicketRow label="Apertura de caja" value={formatPrice(session.openingCents)} />
      <TicketRow label="Ventas en efectivo" value={`+ ${formatPrice(totals.methods.efectivo)}`} />
      {totals.ingresosCents ? <TicketRow label="Ingresos" value={`+ ${formatPrice(totals.ingresosCents)}`} /> : null}
      <TicketRow label="Gastos" value={`- ${formatPrice(totals.expensesCents)}`} />
      {totals.refundsByMethod.efectivo ? <TicketRow label="Devoluciones" value={`- ${formatPrice(totals.refundsByMethod.efectivo)}`} /> : null}
      {totals.egresosCents ? <TicketRow label="Otros egresos" value={`- ${formatPrice(totals.egresosCents)}`} /> : null}
      <div style={{ borderTop: "0.3mm solid #000", marginTop: "1mm", paddingTop: "1mm" }}>
        <TicketRow label="Efectivo en caja" value={formatPrice(cash)} strong />
      </div>
      {closed ? (
        <>
          <TicketRow label="Contado" value={formatPrice(session.countedCashCents!)} />
          <TicketRow label="Diferencia" value={diff === 0 ? "Cuadra" : signed(diff!)} strong />
          {session.closingNote ? <div>Nota: {session.closingNote}</div> : null}
        </>
      ) : null}

      <Title>FORMAS DE PAGO</Title>
      {methods.length ? methods.map((m) => <TicketRow key={m.method} label={PAYMENT_LABEL[m.method]} value={formatPrice(m.cents)} />) : <div>Sin ventas</div>}
      <div style={{ borderTop: "0.3mm solid #000", marginTop: "1mm", paddingTop: "1mm" }}>
        <TicketRow label="Total de ventas" value={formatPrice(totals.salesCents)} strong />
      </div>
      {totals.refundsCount ? <TicketRow label={`Devoluciones (${totals.refundsCount})`} value={`- ${formatPrice(totals.refundsCents)}`} /> : null}

      {documents.length ? (
        <>
          <Title>COMPROBANTES</Title>
          {documents.map((d) => (
            <TicketRow key={d.type} label={`${POS_DOCUMENT_LABEL[d.type]} (${d.count})${d.voided ? ` +${d.voided} anul.` : ""}`} value={formatPrice(d.cents)} />
          ))}
        </>
      ) : null}

      <Title>TRANSACCIONES</Title>
      {lines.length ? (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "0.3mm solid #000" }}>
              <th style={{ textAlign: "left", fontWeight: 700, padding: "0.5mm 0" }}>#</th>
              <th style={{ textAlign: "left", fontWeight: 700 }}>Tipo</th>
              <th style={{ textAlign: "left", fontWeight: 700 }}>Documento</th>
              <th style={{ textAlign: "right", fontWeight: 700 }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i} style={{ borderBottom: "0.2mm dotted #000", verticalAlign: "top" }}>
                <td style={{ padding: "0.6mm 1mm 0.6mm 0" }}>{i + 1}</td>
                <td style={{ paddingRight: "1mm" }}>{KIND_LABEL[l.kind]}</td>
                <td style={{ paddingRight: "1mm", textTransform: l.kind === "gasto" ? "uppercase" : undefined, wordBreak: "break-word" }}>{l.document}</td>
                <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>{(l.cents / 100).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div>Sin movimientos</div>
      )}
      <div style={{ marginTop: "1mm" }}>Montos en soles (PEN).</div>
      {ticketRule}
      <div style={{ marginTop: "8mm", display: "flex", gap: "6mm" }}>
        <div style={{ flex: 1, borderTop: "0.3mm solid #000", textAlign: "center", paddingTop: "1mm" }}>Vendedor</div>
        <div style={{ flex: 1, borderTop: "0.3mm solid #000", textAlign: "center", paddingTop: "1mm" }}>Recibe</div>
      </div>
    </div>
  );
}
