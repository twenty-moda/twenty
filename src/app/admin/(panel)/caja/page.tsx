import type { Metadata } from "next";
import Link from "next/link";
import { AdminPage, buttonClass, Card, EmptyState, formatDateTime, Pagination } from "@/components/admin/ui";
import { cn } from "@/lib/cn";
import { formatPrice } from "@/lib/money";
import { getDb } from "@/server/db/client";
import { listWarehouses } from "@/server/services/inventory";
import { getCashSession, getOpenSession, listCashSessions } from "@/server/services/pos";
import { requireStaff } from "../../_lib/auth";
import { CashMovementForm, CloseCashForm } from "./cash-forms";
import { CashMovementsList, CashSummary } from "./cash-summary";

// El admin se arma en el servidor en cada visita (lee la sesión): no se exige navegación instantánea.
export const instant = false;
export const metadata: Metadata = { title: "Caja" };

export default async function CashPage({ searchParams }: PageProps<"/admin/caja">) {
  await requireStaff();
  const page = Number((await searchParams).pagina) || 1;
  const db = getDb();
  const warehouses = (await listWarehouses(db)).filter((w) => w.isActive);
  const open = await Promise.all(
    warehouses.map(async (w) => {
      const session = await getOpenSession(db, w.id);
      return { warehouse: w, session: session ? await getCashSession(db, session.number) : null };
    }),
  );
  const history = await listCashSessions(db, { page });

  return (
    <AdminPage title="Caja" description="La caja de cada tienda: lo que se cobró por medio de pago, los ingresos y egresos de efectivo y el cierre con el arqueo.">
      <div className="space-y-4">
        {open.map(({ warehouse, session }) =>
          session ? (
            <Card
              key={warehouse.id}
              title={`${warehouse.name} · Caja #${session.number} abierta`}
              actions={
                <Link href={`/admin/pos?tienda=${warehouse.id}`} className={buttonClass("primary", "sm")}>
                  Ir a vender
                </Link>
              }
            >
              <div className="space-y-6">
                <CashSummary session={session} />
                <div className="grid grid-cols-1 gap-6 border-t border-line pt-5 lg:grid-cols-2">
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold">Ingresos y egresos de efectivo</h3>
                    <CashMovementsList movements={session.movements} />
                    <CashMovementForm sessionId={session.id} />
                  </div>
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold">Cerrar caja</h3>
                    <CloseCashForm sessionId={session.id} number={session.number} expectedCashCents={session.expectedNowCents} />
                  </div>
                </div>
                <Link href={`/admin/caja/${session.number}`} className="inline-block text-sm text-muted underline hover:text-white">
                  Ver las ventas de esta caja
                </Link>
              </div>
            </Card>
          ) : (
            <div key={warehouse.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line px-5 py-4 text-sm">
              <span>
                <span className="font-semibold">{warehouse.name}</span> <span className="text-muted">· caja cerrada</span>
              </span>
              <Link href={`/admin/pos?tienda=${warehouse.id}`} className={buttonClass("secondary", "sm")}>
                Abrir caja
              </Link>
            </div>
          ),
        )}

        <h2 className="pt-4 text-lg font-bold">Historial</h2>
        {history.rows.length === 0 ? (
          <EmptyState title="Aún no hay cajas" />
        ) : (
          <>
            <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line">
              {history.rows.map((s) => {
                const diff = s.closedAt && s.countedCashCents !== null && s.expectedCashCents !== null ? s.countedCashCents - s.expectedCashCents : null;
                return (
                  <li key={s.number}>
                    <Link href={`/admin/caja/${s.number}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm hover:bg-surface">
                      <span className="w-16 font-mono font-semibold">#{s.number}</span>
                      <span className="min-w-[10rem] flex-1">
                        {s.warehouseName}
                        <span className="block text-xs text-subtle">
                          {formatDateTime(s.openedAt)}
                          {s.openedByName ? ` · ${s.openedByName}` : ""}
                        </span>
                      </span>
                      <span className="tabular-nums">
                        {s.salesCount} {s.salesCount === 1 ? "venta" : "ventas"} · {formatPrice(s.salesCents)}
                      </span>
                      <span className={cn("w-28 text-right text-xs font-semibold", !s.closedAt ? "text-info" : diff === 0 ? "text-success" : "text-warning")}>
                        {!s.closedAt ? "Abierta" : diff === 0 ? "Cuadró" : diff! > 0 ? `Sobró ${formatPrice(diff!)}` : `Faltó ${formatPrice(-diff!)}`}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
            <Pagination page={history.page} pageCount={history.pageCount} href={(p) => `/admin/caja?pagina=${p}`} />
          </>
        )}
      </div>
    </AdminPage>
  );
}
