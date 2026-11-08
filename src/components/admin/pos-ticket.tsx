import type { CSSProperties } from "react";
import { formatPrice } from "@/lib/money";
import { DOCUMENT_LABEL } from "@/lib/order-status";
import { formatDocNumber, PAYMENT_LABEL, POS_DOCUMENT_LABEL } from "@/lib/pos";
import type { PosSaleDetail } from "@/server/services/pos";

export type TicketCompany = { legalName: string; ruc: string };

/** Papel de 80 mm (72 mm imprimibles). El largo lo corta la impresora: se deja una hoja alta. */
export const TICKET_PAGE = "@page { size: 80mm 297mm; margin: 0 }";

export const ticketDisplay: CSSProperties = { fontFamily: "var(--font-big-shoulders), Impact, 'Arial Narrow', sans-serif" };
/** Fecha completa (con año) en hora de Lima: "29/10/2026 17:56". */
export const ticketDate = new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
export const ticketRule = <div style={{ borderTop: "0.3mm dashed #000", margin: "2mm 0" }} />;

export function TicketRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: "2mm", fontWeight: strong ? 700 : 500 }}>
      <span>{label}</span>
      <span style={{ whiteSpace: "nowrap" }}>{value}</span>
    </div>
  );
}

/** Ticket de la venta en tienda, en la línea de las etiquetas: solo negro, marca en Big Shoulders y datos en mono. */
export function PosTicket({ sale, company }: { sale: PosSaleDetail; company: TicketCompany }) {
  const cash = sale.payments.filter((p) => p.method === "efectivo");
  return (
    <div style={{ width: "72mm", margin: "0 4mm", padding: "3mm 0 6mm", background: "#fff", color: "#000", fontFamily: "var(--font-plex-mono), ui-monospace, monospace", fontSize: "2.9mm", lineHeight: 1.35 }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ ...ticketDisplay, fontWeight: 900, fontSize: "8mm", lineHeight: 1, letterSpacing: "0.3em", paddingLeft: "0.3em" }}>TWENTY</div>
        {company.legalName ? <div style={{ marginTop: "1.5mm", fontWeight: 600 }}>{company.legalName}</div> : null}
        {company.ruc ? <div>RUC {company.ruc}</div> : null}
        <div>{sale.warehouseName}</div>
        {sale.warehouseAddress ? <div>{sale.warehouseAddress}</div> : null}
      </div>
      {ticketRule}
      <div style={{ textAlign: "center" }}>
        <div style={{ ...ticketDisplay, fontWeight: 800, fontSize: "4.6mm", textTransform: "uppercase", letterSpacing: "0.08em" }}>{POS_DOCUMENT_LABEL[sale.documentType]}</div>
        <div style={{ fontWeight: 700, fontSize: "3.4mm" }}>{formatDocNumber(sale.series, sale.number)}</div>
        <div>{ticketDate.format(new Date(sale.createdAt)).replace(",", "")}</div>
        {sale.sellerName ? <div>Atendió: {sale.sellerName}</div> : null}
      </div>
      {sale.customerName || sale.customerDocumentNumber ? (
        <>
          {ticketRule}
          <div>
            Cliente: {sale.customerName ?? "—"}
            {sale.customerDocumentNumber ? (
              <div>
                {sale.customerDocumentType ? DOCUMENT_LABEL[sale.customerDocumentType] : "Doc."} {sale.customerDocumentNumber}
              </div>
            ) : null}
          </div>
        </>
      ) : null}
      {ticketRule}
      {sale.items.map((item) => (
        <div key={item.id} style={{ marginBottom: "1.5mm" }}>
          <div style={{ fontWeight: 700, textTransform: "uppercase" }}>{item.productName}</div>
          <div>
            {item.colorName} · T {item.sizeLabel} · {item.sku}
          </div>
          <TicketRow label={`${item.quantity} × ${formatPrice(item.unitPriceCents)}`} value={formatPrice(item.unitPriceCents * item.quantity)} />
          {item.discountCents ? <TicketRow label={`  Promo ${item.promotionName ?? ""}`} value={`−${formatPrice(item.discountCents)}`} /> : null}
        </div>
      ))}
      {ticketRule}
      <TicketRow label="Subtotal" value={formatPrice(sale.subtotalCents)} />
      {sale.promoDiscountCents ? <TicketRow label="Promociones" value={`−${formatPrice(sale.promoDiscountCents)}`} /> : null}
      {sale.manualDiscountCents ? <TicketRow label="Descuento" value={`−${formatPrice(sale.manualDiscountCents)}`} /> : null}
      {sale.shippingCents ? <TicketRow label="Envío" value={formatPrice(sale.shippingCents)} /> : null}
      <div style={{ ...ticketDisplay, display: "flex", justifyContent: "space-between", fontWeight: 900, fontSize: "6mm", lineHeight: 1.1, marginTop: "1.5mm" }}>
        <span>TOTAL</span>
        <span>{formatPrice(sale.totalCents)}</span>
      </div>
      {ticketRule}
      {sale.payments.map((p) => (
        <TicketRow key={p.id} label={`${PAYMENT_LABEL[p.method]}${p.reference ? ` · Op. ${p.reference}` : ""}`} value={formatPrice(p.method === "efectivo" ? (p.receivedCents ?? p.amountCents) : p.amountCents)} />
      ))}
      {cash.length && sale.changeCents ? <TicketRow label="Vuelto" value={formatPrice(sale.changeCents)} strong /> : null}
      {sale.status === "anulada" ? (
        <div style={{ ...ticketDisplay, marginTop: "3mm", border: "0.6mm solid #000", textAlign: "center", fontWeight: 900, fontSize: "6mm", letterSpacing: "0.2em" }}>ANULADA</div>
      ) : null}
      {ticketRule}
      <div style={{ textAlign: "center" }}>
        <div style={{ fontWeight: 600 }}>¡Gracias por comprar en TWENTY!</div>
        <div>twentymoda.com</div>
      </div>
    </div>
  );
}
