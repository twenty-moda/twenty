import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { displayFont, monoFont } from "@/components/home/fonts";
import { PosTicket } from "@/components/admin/pos-ticket";
import { AdminPage, Badge, Card, formatDateTime } from "@/components/admin/ui";
import { cn } from "@/lib/cn";
import { formatDocNumber, POS_DOCUMENT_LABEL } from "@/lib/pos";
import { getDb } from "@/server/db/client";
import { getSiteSettings } from "@/server/services/content";
import { getPosSale } from "@/server/services/pos";
import { requireStaff } from "../../../_lib/auth";
import { ReprintButton, VoidSaleForm } from "./sale-actions";

export const metadata: Metadata = { title: "Venta en tienda" };
// El admin se arma en el servidor en cada visita (lee la sesión): no se exige navegación instantánea.
export const instant = false;

const UUID = /^[0-9a-f-]{36}$/i;

export default async function StoreSalePage({ params }: PageProps<"/admin/ventas-tienda/[id]">) {
  const me = await requireStaff();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const db = getDb();
  const [sale, settings] = await Promise.all([getPosSale(db, id), getSiteSettings(db)]);
  if (!sale) notFound();
  const company = { legalName: settings.company.legalName, ruc: settings.company.ruc };
  const fontClass = `${displayFont.variable} ${monoFont.variable}`;

  return (
    <AdminPage
      title={`${POS_DOCUMENT_LABEL[sale.documentType]} ${formatDocNumber(sale.series, sale.number)}`}
      back={{ href: "/admin/ventas-tienda", label: "Ventas en tienda" }}
      description={`${sale.warehouseName} · Caja #${sale.sessionNumber} · ${formatDateTime(sale.createdAt)}`}
      actions={<ReprintButton sale={sale} company={company} fontClass={fontClass} />}
    >
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_auto]">
        <div className="space-y-4">
          {sale.status === "anulada" ? (
            <Card>
              <Badge tone="danger">Anulada</Badge>
              <p className="mt-2 text-sm">
                {sale.voidReason}
                <span className="block text-xs text-subtle">
                  {formatDateTime(sale.voidedAt!)}
                  {sale.voidedByName ? ` · ${sale.voidedByName}` : ""}
                </span>
              </p>
            </Card>
          ) : sale.sessionClosedAt ? (
            <p className="text-sm text-muted">La caja de esta venta ya se cerró: ya no se puede anular. Un cambio o devolución se registra como una venta nueva o una salida de caja.</p>
          ) : me.role === "admin" ? (
            <VoidSaleForm saleId={sale.id} />
          ) : (
            <p className="text-sm text-muted">Para anular una venta, pídeselo a un admin.</p>
          )}
        </div>
        <div className={cn("w-fit rounded-lg bg-white py-2 shadow-lg", fontClass)}>
          <PosTicket sale={sale} company={company} />
        </div>
      </div>
    </AdminPage>
  );
}
