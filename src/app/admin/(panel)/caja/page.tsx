import type { Metadata } from "next";
import Link from "next/link";
import { AdminPage, buttonClass, Card, EmptyState, formatDateTime, Pagination } from "@/components/admin/ui";
import { cn } from "@/lib/cn";
import { formatPrice } from "@/lib/money";
import { getDb } from "@/server/db/client";
import { listWarehouses } from "@/server/services/inventory";
import { getCashSession, listCashSessions, listOpenSessions } from "@/server/services/pos";
import { requireStaff } from "../../_lib/auth";
import { CashSummary } from "./cash-summary";
import { OpenCashPanel } from "./open-cash-panel";

// El admin se arma en el servidor en cada visita (lee la sesión): no se exige navegación instantánea.
export const instant = false;
export const metadata: Metadata = { title: "Caja" };

/**
 * Cada vendedor tiene su caja (como en Insaga): arriba la suya en cada tienda; el admin ve además las de los demás que
 * siguen abiertas. Abajo, el historial (el vendedor, solo las suyas).
 */
export default async function CashPage({ searchParams }: PageProps<"/admin/caja">) {
  const user = await requireStaff();
  const admin = user.role === "admin";
  const page = Number((await searchParams).pagina) || 1;
  const db = getDb();
  const [warehouses, openAll, history] = await Promise.all([
    listWarehouses(db).then((ws) => ws.filter((w) => w.isActive)),
    listOpenSessions(db),
    listCashSessions(db, { page, userId: admin ? undefined : user.id }),
  ]);
  const mine = await Promise.all(
    warehouses.map(async (w) => {
      const open = openAll.find((s) => s.warehouseId === w.id && s.openedBy === user.id);
      return { warehouse: w, session: open ? await getCashSession(db, open.number) : null };
    }),
  );
  const others = admin ? await Promise.all(openAll.filter((s) => s.openedBy !== user.id).map((s) => getCashSession(db, s.number))) : [];

  return (
    <AdminPage title="Caja" description="Cada vendedor tiene su caja: lo que cobró por medio de pago, sus gastos, los ingresos y egresos de efectivo y el cierre con el arqueo.">
      <div className="space-y-4">
        {mine.map(({ warehouse, session }) =>
          session ? (
            <Card
              key={warehouse.id}
              title={`Tu caja #${session.number} · ${warehouse.name}`}
              actions={
                <Link href={`/admin/pos?tienda=${warehouse.id}`} className={buttonClass("primary", "sm")}>
                  Ir a vender
                </Link>
              }
            >
              <OpenCashPanel session={session} canVoidAll={admin} userId={user.id} />
            </Card>
          ) : (
            <div key={warehouse.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line px-5 py-4 text-sm">
              <span>
                <span className="font-semibold">{warehouse.name}</span> <span className="text-muted">· tu caja está cerrada</span>
              </span>
              <Link href={`/admin/pos?tienda=${warehouse.id}`} className={buttonClass("secondary", "sm")}>
                Abrir mi caja
              </Link>
            </div>
          ),
        )}

        {others.length ? (
          <>
            <h2 className="pt-4 text-lg font-bold">Otras cajas abiertas</h2>
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              {others.map((s) =>
                s ? (
                  <Card
                    key={s.id}
                    title={`Caja #${s.number} · ${s.openedByName ?? "Sin nombre"} · ${s.warehouseName}`}
                    actions={
                      <Link href={`/admin/caja/${s.number}`} className={buttonClass("secondary", "sm")}>
                        Gastos y cierre
                      </Link>
                    }
                  >
                    <CashSummary session={s} />
                  </Card>
                ) : null,
              )}
            </div>
          </>
        ) : null}

        <h2 className="pt-4 text-lg font-bold">{admin ? "Historial" : "Tus cajas anteriores"}</h2>
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
                        {s.openedByName ?? "Sin nombre"} · {s.warehouseName}
                        <span className="block text-xs text-subtle">{formatDateTime(s.openedAt)}</span>
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
