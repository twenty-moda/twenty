import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AdminPage, Card, EmptyState } from "@/components/admin/ui";
import { getDb } from "@/server/db/client";
import { getCashSession, listPosSales } from "@/server/services/pos";
import { requireStaff } from "../../../_lib/auth";
import { SalesList } from "../../ventas-tienda/sales-list";
import { CashMovementsList, CashSummary } from "../cash-summary";

export async function generateMetadata({ params }: PageProps<"/admin/caja/[number]">): Promise<Metadata> {
  const { number } = await params;
  return { title: `Caja #${number}` };
}

// El admin se arma en el servidor en cada visita (lee la sesión): no se exige navegación instantánea.
export const instant = false;

export default async function CashSessionPage({ params }: PageProps<"/admin/caja/[number]">) {
  await requireStaff();
  const n = Number((await params).number);
  if (!Number.isInteger(n)) notFound();
  const db = getDb();
  const session = await getCashSession(db, n);
  if (!session) notFound();
  const sales = await listPosSales(db, { sessionId: session.id, page: 1 });

  return (
    <AdminPage title={`Caja #${session.number} · ${session.warehouseName}`} back={{ href: "/admin/caja", label: "Caja" }} description={session.closedAt ? "Cerrada" : "Abierta"}>
      <div className="space-y-4">
        <Card>
          <CashSummary session={session} />
        </Card>
        <Card title="Ingresos y egresos de efectivo">
          <CashMovementsList movements={session.movements} />
        </Card>
        <h2 className="pt-2 text-lg font-bold">Ventas ({sales.total})</h2>
        {sales.rows.length ? <SalesList rows={sales.rows} /> : <EmptyState title="Sin ventas en esta caja" />}
        {sales.total > sales.rows.length ? <p className="text-sm text-muted">Se muestran las {sales.rows.length} más recientes.</p> : null}
      </div>
    </AdminPage>
  );
}
