import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { AdminPage } from "@/components/admin/ui";
import { todayInLima } from "@/lib/reports";
import { getDb } from "@/server/db/client";
import { listPosVariants } from "@/server/services/pos";
import { formatQuoteNumber, getQuote } from "@/server/services/quotes";
import { requireStaff } from "../../../../_lib/auth";
import { QuoteForm } from "../../quote-form";

export const instant = false;
export const metadata: Metadata = { title: "Editar cotización" };

const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

export default async function EditQuotePage({ params }: PageProps<"/admin/cotizaciones/[number]/editar">) {
  await requireStaff();
  const n = Number((await params).number);
  if (!Number.isInteger(n)) notFound();
  const db = getDb();
  const quote = await getQuote(db, n);
  if (!quote) notFound();
  if (quote.status !== "vigente") redirect(`/admin/cotizaciones/${n}`);
  const variants = (await listPosVariants(db, quote.warehouseId)).filter((v) => v.isActive || quote.items.some((i) => i.variantId === v.variantId));
  // La validez se vuelve a contar desde hoy al guardar: se proponen los días que quedaban (o 7 si ya venció).
  const left = daysBetween(todayInLima(), quote.validUntil);
  const validDays = left >= 1 ? Math.min(90, left) : 7;
  return (
    <AdminPage title={`Editar ${formatQuoteNumber(quote.number)}`} back={{ href: `/admin/cotizaciones/${n}`, label: formatQuoteNumber(quote.number) }}>
      <QuoteForm
        warehouse={{ id: quote.warehouseId, name: quote.warehouseName }}
        variants={variants}
        initial={{
          id: quote.id,
          warehouseId: quote.warehouseId,
          customer: {
            documentType: quote.customerDocumentType,
            documentNumber: quote.customerDocumentNumber,
            name: quote.customerName,
            phone: quote.customerPhone,
            email: quote.customerEmail,
            address: quote.customerAddress,
          },
          validDays,
          note: quote.note,
          lines: quote.items.filter((i) => i.variantId).map((i) => ({ variantId: i.variantId!, quantity: i.quantity, unitPriceCents: i.unitPriceCents })),
        }}
      />
    </AdminPage>
  );
}
