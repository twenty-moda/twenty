import type { CSSProperties } from "react";
import { formatPrice } from "@/lib/money";
import { DOCUMENT_LABEL } from "@/lib/order-status";
import type { QuoteDetail } from "@/server/services/quotes";

/** A4 con 12 mm de margen. */
export const A4_PAGE = "@page { size: A4; margin: 12mm }";

export type QuoteCompany = { legalName: string; ruc: string; address: string; phone: string; email: string };

const display: CSSProperties = { fontFamily: "var(--font-big-shoulders), Impact, 'Arial Narrow', sans-serif" };
const cell: CSSProperties = { padding: "1.6mm 2mm", borderBottom: "0.2mm solid #d4d4d4", verticalAlign: "top" };
const head: CSSProperties = { ...cell, borderBottom: "0.4mm solid #000", fontWeight: 700, textAlign: "left", fontSize: "2.6mm", textTransform: "uppercase", letterSpacing: "0.04em" };
const day = (iso: string) => iso.split("-").reverse().join("/");
const limaDay = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" });
const money = (cents: number) => (cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Cotización en A4, en la línea de la marca (negro sobre blanco): para imprimir o guardar en PDF y mandar al cliente. */
export function QuoteSheet({ quote, company, formattedNumber }: { quote: QuoteDetail; company: QuoteCompany; formattedNumber: string }) {
  const units = quote.items.reduce((s, i) => s + i.quantity, 0);
  const discount = quote.subtotalCents - quote.totalCents;
  return (
    <div style={{ width: "186mm", background: "#fff", color: "#000", fontFamily: "var(--font-plex-mono), ui-monospace, monospace", fontSize: "3mm", lineHeight: 1.4, padding: "2mm" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "8mm", alignItems: "flex-start" }}>
        <div>
          <div style={{ ...display, fontWeight: 900, fontSize: "11mm", lineHeight: 1, letterSpacing: "0.25em" }}>TWENTY</div>
          {company.legalName ? <div style={{ marginTop: "2mm", fontWeight: 700 }}>{company.legalName}</div> : null}
          {company.ruc ? <div>RUC {company.ruc}</div> : null}
          {company.address || quote.warehouseAddress ? <div>{company.address || quote.warehouseAddress}</div> : null}
          {[company.phone, company.email].filter(Boolean).length ? <div>{[company.phone, company.email].filter(Boolean).join(" · ")}</div> : null}
          <div>twentymoda.com</div>
        </div>
        <div style={{ border: "0.5mm solid #000", padding: "3mm 5mm", textAlign: "center", minWidth: "58mm" }}>
          <div style={{ ...display, fontWeight: 800, fontSize: "6mm", letterSpacing: "0.1em" }}>COTIZACIÓN</div>
          <div style={{ fontWeight: 700, fontSize: "4mm" }}>{formattedNumber}</div>
          <div style={{ marginTop: "1mm" }}>Fecha: {day(limaDay.format(new Date(quote.createdAt)))}</div>
          <div>Válida hasta: {day(quote.validUntil)}</div>
        </div>
      </div>

      <div style={{ marginTop: "6mm", border: "0.2mm solid #000", padding: "2.5mm 3mm", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1mm 6mm" }}>
        <div>
          <strong>Cliente:</strong> {quote.customerName}
        </div>
        <div>
          {quote.customerDocumentNumber ? (
            <>
              <strong>{quote.customerDocumentType ? DOCUMENT_LABEL[quote.customerDocumentType] : "Doc."}:</strong> {quote.customerDocumentNumber}
            </>
          ) : null}
        </div>
        {quote.customerAddress ? (
          <div style={{ gridColumn: "1 / -1" }}>
            <strong>Dirección:</strong> {quote.customerAddress}
          </div>
        ) : null}
        {quote.customerPhone || quote.customerEmail ? (
          <div style={{ gridColumn: "1 / -1" }}>
            <strong>Contacto:</strong> {[quote.customerPhone, quote.customerEmail].filter(Boolean).join(" · ")}
          </div>
        ) : null}
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "5mm" }}>
        <thead>
          <tr>
            <th style={{ ...head, width: "6mm" }}>#</th>
            <th style={{ ...head, width: "22mm" }}>Código</th>
            <th style={head}>Descripción</th>
            <th style={{ ...head, textAlign: "right", width: "13mm" }}>Cant.</th>
            <th style={{ ...head, textAlign: "right", width: "20mm" }}>P. lista</th>
            <th style={{ ...head, textAlign: "right", width: "20mm" }}>P. unit.</th>
            <th style={{ ...head, textAlign: "right", width: "24mm" }}>Importe</th>
          </tr>
        </thead>
        <tbody>
          {quote.items.map((item, i) => (
            <tr key={item.id}>
              <td style={cell}>{i + 1}</td>
              <td style={cell}>{item.sku}</td>
              <td style={cell}>
                <span style={{ fontWeight: 700, textTransform: "uppercase" }}>{item.productName}</span> · {item.colorName} · Talla {item.sizeLabel}
              </td>
              <td style={{ ...cell, textAlign: "right" }}>{item.quantity}</td>
              <td style={{ ...cell, textAlign: "right", color: "#555" }}>{money(item.listPriceCents)}</td>
              <td style={{ ...cell, textAlign: "right" }}>{money(item.unitPriceCents)}</td>
              <td style={{ ...cell, textAlign: "right", fontWeight: 700 }}>{money(item.totalCents)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "4mm" }}>
        <div style={{ width: "80mm" }}>
          <Row label={`${units} prendas a precio de lista`} value={formatPrice(quote.subtotalCents)} />
          {discount > 0 ? <Row label="Descuento mayorista" value={`−${formatPrice(discount)}`} /> : null}
          <div style={{ ...display, display: "flex", justifyContent: "space-between", borderTop: "0.5mm solid #000", marginTop: "1.5mm", paddingTop: "1.5mm", fontWeight: 900, fontSize: "6mm" }}>
            <span>TOTAL</span>
            <span>{formatPrice(quote.totalCents)}</span>
          </div>
          <div style={{ textAlign: "right", fontSize: "2.6mm" }}>Precios en soles, con IGV incluido.</div>
        </div>
      </div>

      {quote.note ? (
        <div style={{ marginTop: "6mm" }}>
          <div style={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em" }}>Condiciones</div>
          <div style={{ whiteSpace: "pre-line" }}>{quote.note}</div>
        </div>
      ) : null}
      <div style={{ marginTop: "6mm", fontSize: "2.6mm", color: "#444" }}>
        Sujeto a stock al momento de la compra. {quote.userName ? `Atendió: ${quote.userName}.` : ""}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: "4mm" }}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
