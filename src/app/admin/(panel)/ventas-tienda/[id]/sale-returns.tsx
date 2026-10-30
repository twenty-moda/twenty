import { formatDateTime } from "@/components/admin/ui";
import { formatPrice } from "@/lib/money";
import { formatDocNumber, PAYMENT_LABEL } from "@/lib/pos";
import type { SaleReturn } from "@/server/services/pos-returns";
import { CreditNoteStatus } from "../sunat-status";

/** Las devoluciones de la venta: qué prendas, cuánto se entregó y su nota de crédito. */
export function SaleReturns({ returns }: { returns: SaleReturn[] }) {
  return (
    <section aria-label="Devoluciones" className="space-y-3">
      <h2 className="font-semibold">Devoluciones</h2>
      {returns.map((r) => (
        <div key={r.id} className="space-y-3 rounded-2xl border border-line p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm">
              <span className="font-semibold">{r.creditNoteSeries ? `Nota de crédito ${formatDocNumber(r.creditNoteSeries, r.creditNoteNumber!)}` : `Devolución #${r.number}`}</span>
              <span className="block text-xs text-subtle">
                {formatDateTime(r.createdAt)} · Caja #{r.sessionNumber}
                {r.userName ? ` · ${r.userName}` : ""}
              </span>
            </p>
            <p className="text-sm font-semibold tabular-nums">
              −{formatPrice(r.refundCents)} <span className="font-normal text-muted">por {PAYMENT_LABEL[r.refundMethod]}</span>
            </p>
          </div>
          <ul className="space-y-1 text-sm">
            {r.items.map((i) => (
              <li key={i.saleItemId} className="flex justify-between gap-3">
                <span>
                  {i.quantity} × {i.productName} · {i.colorName} · Talla {i.sizeLabel}
                </span>
                <span className="tabular-nums text-muted">{formatPrice(i.amountCents)}</span>
              </li>
            ))}
          </ul>
          <p className="text-sm text-muted">{r.reason}</p>
          {r.sunatStatus ? <CreditNoteStatus ret={r} /> : null}
        </div>
      ))}
    </section>
  );
}
