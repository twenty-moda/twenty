import { Printer } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminPage, buttonClass, Card, EmptyState } from "@/components/admin/ui";
import { getDb } from "@/server/db/client";
import { getCashSession, listPosSales } from "@/server/services/pos";
import { requireStaff } from "../../../_lib/auth";
import { SalesList } from "../../ventas-tienda/sales-list";
import { CashExpensesList, CashMovementsList, CashSummary } from "../cash-summary";
import { OpenCashPanel } from "../open-cash-panel";

export async function generateMetadata({ params }: PageProps<"/admin/caja/[number]">): Promise<Metadata> {
  const { number } = await params;
  return { title: `Caja #${number}` };
}

// El admin se arma en el servidor en cada visita (lee la sesión): no se exige navegación instantánea.
export const instant = false;

export default async function CashSessionPage({ params, searchParams }: PageProps<"/admin/caja/[number]">) {
  const user = await requireStaff();
  const n = Number((await params).number);
  if (!Number.isInteger(n)) notFound();
  const db = getDb();
  const session = await getCashSession(db, n);
  // Un vendedor solo ve sus cajas.
  if (!session || (user.role !== "admin" && session.openedBy !== user.id)) notFound();
  const sales = await listPosSales(db, { sessionId: session.id, page: 1 });
  const justClosed = (await searchParams).cerrada === "1" && session.closedAt;

  return (
    <AdminPage
      title={`Caja #${session.number} · ${session.warehouseName}`}
      back={{ href: "/admin/caja", label: "Caja" }}
      description={`${session.openedByName ?? "Sin nombre"} · ${session.closedAt ? "Cerrada" : "Abierta"}`}
      actions={
        <Link href={`/admin/caja/${session.number}/reporte`} className={buttonClass(justClosed ? "primary" : "secondary")}>
          <Printer className="size-4" aria-hidden /> Reporte de caja
        </Link>
      }
    >
      <div className="space-y-4">
        {justClosed ? <p className="rounded-xl bg-success/15 px-4 py-3 text-sm text-success">Caja cerrada. Imprime el reporte de caja para dejarlo con el efectivo.</p> : null}
        {session.closedAt ? (
          <>
            <Card>
              <CashSummary session={session} />
            </Card>
            <Card title="Gastos pagados de esta caja">
              <CashExpensesList expenses={session.expenses} />
            </Card>
            <Card title="Otros ingresos y egresos de efectivo">
              <CashMovementsList movements={session.movements} />
            </Card>
          </>
        ) : (
          <Card>
            <OpenCashPanel session={session} canVoidAll={user.role === "admin"} userId={user.id} />
          </Card>
        )}
        <h2 className="pt-2 text-lg font-bold">Ventas ({sales.total})</h2>
        {sales.rows.length ? <SalesList rows={sales.rows} /> : <EmptyState title="Sin ventas en esta caja" />}
        {sales.total > sales.rows.length ? <p className="text-sm text-muted">Se muestran las {sales.rows.length} más recientes.</p> : null}
      </div>
    </AdminPage>
  );
}
