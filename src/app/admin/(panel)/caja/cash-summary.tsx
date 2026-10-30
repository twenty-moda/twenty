import { formatDateTime } from "@/components/admin/ui";
import { cn } from "@/lib/cn";
import { formatPrice } from "@/lib/money";
import { PAYMENT_LABEL, PAYMENT_METHODS } from "@/lib/pos";
import type { getCashSession } from "@/server/services/pos";

type Session = NonNullable<Awaited<ReturnType<typeof getCashSession>>>;

/** Números de una caja: lo cobrado por medio de pago y la cuenta del efectivo. */
export function CashSummary({ session }: { session: Session }) {
  const { totals } = session;
  const closed = session.closedAt !== null;
  const expected = closed ? session.expectedCashCents! : session.expectedNowCents;
  const diff = closed ? session.countedCashCents! - session.expectedCashCents! : null;
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <dl className="space-y-1.5 text-sm">
        <div className="flex justify-between">
          <dt className="text-muted">Ventas</dt>
          <dd className="font-semibold tabular-nums">
            {totals.salesCount} · {formatPrice(totals.salesCents)}
          </dd>
        </div>
        {PAYMENT_METHODS.map((m) => (
          <div key={m} className="flex justify-between">
            <dt className="text-muted">{PAYMENT_LABEL[m]}</dt>
            <dd className="tabular-nums">{formatPrice(totals.methods[m])}</dd>
          </div>
        ))}
        {totals.voidedCount ? (
          <div className="flex justify-between text-subtle">
            <dt>Anuladas</dt>
            <dd className="tabular-nums">{totals.voidedCount}</dd>
          </div>
        ) : null}
        {totals.refundsCount ? (
          <div className="flex justify-between">
            <dt className="text-muted">Devoluciones</dt>
            <dd className="tabular-nums">
              {totals.refundsCount} · −{formatPrice(totals.refundsCents)}
            </dd>
          </div>
        ) : null}
      </dl>
      <dl className="space-y-1.5 text-sm">
        <div className="flex justify-between">
          <dt className="text-muted">Monto inicial</dt>
          <dd className="tabular-nums">{formatPrice(session.openingCents)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted">+ Ventas en efectivo</dt>
          <dd className="tabular-nums">{formatPrice(totals.methods.efectivo)}</dd>
        </div>
        {totals.refundsByMethod.efectivo ? (
          <div className="flex justify-between">
            <dt className="text-muted">− Devoluciones en efectivo</dt>
            <dd className="tabular-nums">{formatPrice(totals.refundsByMethod.efectivo)}</dd>
          </div>
        ) : null}
        <div className="flex justify-between">
          <dt className="text-muted">+ Ingresos</dt>
          <dd className="tabular-nums">{formatPrice(totals.ingresosCents)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted">− Egresos</dt>
          <dd className="tabular-nums">{formatPrice(totals.egresosCents)}</dd>
        </div>
        <div className="flex justify-between border-t border-line pt-1.5 font-semibold">
          <dt>{closed ? "Debía haber" : "Debería haber"}</dt>
          <dd className="tabular-nums">{formatPrice(expected)}</dd>
        </div>
        {closed ? (
          <>
            <div className="flex justify-between">
              <dt className="text-muted">Contado</dt>
              <dd className="tabular-nums">{formatPrice(session.countedCashCents!)}</dd>
            </div>
            <div className={cn("flex justify-between font-semibold", diff === 0 ? "text-success" : "text-warning")}>
              <dt>Diferencia</dt>
              <dd className="tabular-nums">{diff === 0 ? "Cuadra" : diff! > 0 ? `+${formatPrice(diff!)}` : `−${formatPrice(-diff!)}`}</dd>
            </div>
          </>
        ) : null}
      </dl>
      <p className="text-xs text-subtle md:col-span-2">
        Abierta {formatDateTime(session.openedAt)}
        {session.openedByName ? ` por ${session.openedByName}` : ""}
        {closed ? ` · cerrada ${formatDateTime(session.closedAt!)}${session.closedByName ? ` por ${session.closedByName}` : ""}` : ""}
        {session.closingNote ? ` · ${session.closingNote}` : ""}
      </p>
    </div>
  );
}

export function CashMovementsList({ movements }: { movements: Session["movements"] }) {
  if (!movements.length) return <p className="text-sm text-muted">Sin ingresos ni egresos.</p>;
  return (
    <ul className="divide-y divide-line text-sm">
      {movements.map((m) => (
        <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
          <span>
            {m.note}
            <span className="block text-xs text-subtle">
              {formatDateTime(m.createdAt)}
              {m.userName ? ` · ${m.userName}` : ""}
            </span>
          </span>
          <span className={cn("font-semibold tabular-nums", m.type === "ingreso" ? "text-success" : "text-white")}>
            {m.type === "ingreso" ? "+" : "−"}
            {formatPrice(m.amountCents)}
          </span>
        </li>
      ))}
    </ul>
  );
}
