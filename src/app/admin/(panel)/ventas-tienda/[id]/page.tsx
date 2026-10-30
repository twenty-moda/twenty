import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { displayFont, monoFont } from "@/components/home/fonts";
import { PosTicket } from "@/components/admin/pos-ticket";
import { AdminPage, Badge, Card, formatDateTime } from "@/components/admin/ui";
import { cn } from "@/lib/cn";
import { formatDocNumber, POS_DOCUMENT_LABEL, returnLines } from "@/lib/pos";
import { getDb } from "@/server/db/client";
import { getSiteSettings } from "@/server/services/content";
import { getPosSale } from "@/server/services/pos";
import { listSaleReturns } from "@/server/services/pos-returns";
import { requireStaff } from "../../../_lib/auth";
import { SunatStatus } from "../sunat-status";
import { ReprintButton, ReturnForm, VoidSaleForm } from "./sale-actions";
import { SaleReturns } from "./sale-returns";

export const metadata: Metadata = { title: "Venta en tienda" };
// El admin se arma en el servidor en cada visita (lee la sesión): no se exige navegación instantánea.
export const instant = false;

const UUID = /^[0-9a-f-]{36}$/i;

export default async function StoreSalePage({ params }: PageProps<"/admin/ventas-tienda/[id]">) {
  const me = await requireStaff();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const db = getDb();
  const [sale, settings, returns] = await Promise.all([getPosSale(db, id), getSiteSettings(db), listSaleReturns(db, id)]);
  if (!sale) notFound();
  const company = { legalName: settings.company.legalName, ruc: settings.company.ruc };
  const fontClass = `${displayFont.variable} ${monoFont.variable}`;
  const electronic = sale.documentType !== "nota_venta";
  const lines = returnLines(
    sale.items,
    sale.manualDiscountCents,
    returns.flatMap((r) => r.items),
  ).map((l, i) => ({ ...l, sku: sale.items[i].sku, label: `${sale.items[i].productName} · ${sale.items[i].colorName} · Talla ${sale.items[i].sizeLabel}` }));
  const returnable = sale.status === "pagada" && lines.some((l) => l.returnedQty < l.soldQty);
  // La nota de crédito va contra un comprobante aceptado.
  const waitingSunat = returnable && electronic && sale.sunatStatus !== "aceptado";
  // Anular devuelve todo: con una devolución de por medio o con la caja cerrada, lo que queda se devuelve.
  const voidable = sale.status === "pagada" && !returns.length && !sale.sessionClosedAt;
  const mainPayment = [...sale.payments].sort((a, b) => b.amountCents - a.amountCents)[0];

  return (
    <AdminPage
      title={`${POS_DOCUMENT_LABEL[sale.documentType]} ${formatDocNumber(sale.series, sale.number)}`}
      back={{ href: "/admin/ventas-tienda", label: "Ventas en tienda" }}
      description={`${sale.warehouseName} · Caja #${sale.sessionNumber} · ${formatDateTime(sale.createdAt)}`}
      // Boleta o factura: el comprobante que se imprime es el de SUNAT (en SunatStatus). Nota de venta: el ticket de TWENTY.
      actions={electronic ? undefined : <ReprintButton sale={sale} company={company} fontClass={fontClass} />}
    >
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_auto]">
        <div className="space-y-4">
          {electronic ? <SunatStatus sale={sale} /> : null}
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
          ) : null}
          {returns.length ? <SaleReturns returns={returns} /> : null}
          {!returnable && !voidable ? null : me.role !== "admin" ? (
            <p className="text-sm text-muted">Para devolver prendas o anular la venta, pídeselo a un admin.</p>
          ) : (
            <>
              {waitingSunat ? (
                <p className="text-sm text-muted">
                  {sale.sunatStatus === "rechazado" ? "SUNAT rechazó el comprobante: no lleva nota de crédito, se anula la venta." : "Para devolver prendas, SUNAT tiene que aceptar primero el comprobante."}
                </p>
              ) : null}
              <div className="flex flex-wrap items-start gap-2">
                {/* key: después de cada devolución el formulario vuelve a empezar, con lo que queda por devolver. */}
                {returnable && !waitingSunat ? <ReturnForm key={returns.length} saleId={sale.id} lines={lines} defaultMethod={mainPayment?.method ?? "efectivo"} creditNote={electronic} /> : null}
                {voidable ? <VoidSaleForm saleId={sale.id} /> : null}
              </div>
              {voidable && sale.sunatStatus === "aceptado" ? <p className="text-xs text-subtle">Al anular se le pide a SUNAT la baja del comprobante.</p> : null}
            </>
          )}
        </div>
        {electronic ? null : (
          <div className={cn("w-fit rounded-lg bg-white py-2 shadow-lg", fontClass)}>
            <PosTicket sale={sale} company={company} />
          </div>
        )}
      </div>
    </AdminPage>
  );
}
