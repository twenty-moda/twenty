import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AdminPage, EmptyState } from "@/components/admin/ui";
import { formatDocNumber, POS_DOCUMENT_LABEL } from "@/lib/pos";
import { todayInLima } from "@/lib/reports";
import { getDb } from "@/server/db/client";
import { getSiteSettings } from "@/server/services/content";
import { guessLimaUbigeo, lastGuideDefaults } from "@/server/services/dispatch-guides";
import { getPosSale } from "@/server/services/pos";
import { listSaleReturns } from "@/server/services/pos-returns";
import { sunatFromEnv } from "@/server/services/sunat";
import { requireStaff } from "../../../../_lib/auth";
import { GuideForm } from "./guide-form";

export const instant = false;
export const metadata: Metadata = { title: "Guía de remisión" };

const UUID = /^[0-9a-f-]{36}$/i;

export default async function GuidePage({ params }: PageProps<"/admin/ventas-tienda/[id]/guia">) {
  await requireStaff();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const db = getDb();
  const sale = await getPosSale(db, id);
  if (!sale || (sale.documentType !== "boleta" && sale.documentType !== "factura")) notFound();
  const label = `${POS_DOCUMENT_LABEL[sale.documentType]} ${formatDocNumber(sale.series, sale.number)}`;
  const back = { href: `/admin/ventas-tienda/${sale.id}`, label };
  if (!sunatFromEnv()) {
    return (
      <AdminPage title="Guía de remisión" back={back}>
        <EmptyState title="SUNAT todavía no está conectado">La guía de remisión se activa junto con la boleta y la factura.</EmptyState>
      </AdminPage>
    );
  }
  if (sale.status !== "pagada" || sale.sunatStatus !== "aceptado") {
    return (
      <AdminPage title="Guía de remisión" back={back}>
        <EmptyState title={sale.status !== "pagada" ? "La venta está anulada" : "SUNAT todavía no acepta el comprobante"}>La guía va con una boleta o factura aceptada.</EmptyState>
      </AdminPage>
    );
  }
  const [settings, last, returns] = await Promise.all([getSiteSettings(db), lastGuideDefaults(db, sale.warehouseId), listSaleReturns(db, sale.id)]);
  const returned = returns.flatMap((r) => r.items);
  const items = sale.items
    .map((i) => ({
      sku: i.sku,
      description: `${i.productName} · ${i.colorName} · Talla ${i.sizeLabel}`,
      quantity: i.quantity - returned.filter((r) => r.saleItemId === i.id).reduce((s, r) => s + r.quantity, 0),
    }))
    .filter((i) => i.quantity > 0);
  const originAddress = last?.origin?.originAddress ?? sale.warehouseAddress ?? settings.company.address;
  const units = items.reduce((s, i) => s + i.quantity, 0);

  return (
    <AdminPage title="Guía de remisión" back={back} description={`Motivo: venta. Va a SUNAT con la ${label} como documento relacionado.`}>
      <GuideForm
        defaults={{
          saleId: sale.id,
          saleLabel: label,
          today: todayInLima(),
          recipient: {
            documentType: sale.customerDocumentType ?? (sale.documentType === "factura" ? "ruc" : "dni"),
            documentNumber: sale.customerDocumentNumber ?? "",
            name: sale.customerName ?? "",
          },
          origin: { ubigeo: last?.origin?.originUbigeo ?? guessLimaUbigeo(originAddress), address: originAddress ?? "" },
          destination: { ubigeo: guessLimaUbigeo(sale.customerAddress), address: sale.customerAddress ?? "" },
          carrier: last?.carrier ?? null,
          weightKg: Math.max(0.5, Math.round(units * 0.5 * 10) / 10),
          items,
        }}
      />
    </AdminPage>
  );
}
