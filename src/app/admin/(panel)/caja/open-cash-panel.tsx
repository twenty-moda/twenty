import { Printer } from "lucide-react";
import Link from "next/link";
import { buttonClass } from "@/components/admin/ui";
import type { getCashSession } from "@/server/services/pos";
import { CashExpenseForm, CashMovementForm, CloseCashForm, VoidExpenseButton } from "./cash-forms";
import { CashExpensesList, CashMovementsList, CashSummary } from "./cash-summary";

type Session = NonNullable<Awaited<ReturnType<typeof getCashSession>>>;

/**
 * Una caja abierta con todo lo que se hace en ella: los números, los gastos, los ingresos y egresos de efectivo y el
 * cierre. La ven quien la abrió y el admin (en Caja y en su detalle).
 */
export function OpenCashPanel({ session, canVoidAll, userId }: { session: Session; canVoidAll: boolean; userId: string }) {
  return (
    <div className="space-y-6">
      <CashSummary session={session} />
      <div className="grid grid-cols-1 gap-6 border-t border-line pt-5 lg:grid-cols-2">
        <div className="space-y-6">
          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Gastos pagados de esta caja</h3>
            <CashExpensesList expenses={session.expenses} voidButton={(e) => (canVoidAll || e.userId === userId ? <VoidExpenseButton expenseId={e.id} /> : null)} />
            <CashExpenseForm sessionId={session.id} warehouseId={session.warehouseId} />
          </section>
          <section className="space-y-3 border-t border-line pt-5">
            <h3 className="text-sm font-semibold">Otros ingresos y egresos de efectivo</h3>
            <CashMovementsList movements={session.movements} />
            <CashMovementForm sessionId={session.id} />
          </section>
        </div>
        <section className="space-y-3">
          <h3 className="text-sm font-semibold">Cerrar caja</h3>
          <CloseCashForm sessionId={session.id} number={session.number} expectedCashCents={session.expectedNowCents} />
        </section>
      </div>
      <div className="flex flex-wrap gap-2 border-t border-line pt-4">
        <Link href={`/admin/caja/${session.number}/reporte`} className={buttonClass("secondary", "sm")}>
          <Printer className="size-4" aria-hidden /> Reporte de caja
        </Link>
        <Link href={`/admin/caja/${session.number}`} className={buttonClass("ghost", "sm")}>
          Ver las ventas de esta caja
        </Link>
      </div>
    </div>
  );
}
