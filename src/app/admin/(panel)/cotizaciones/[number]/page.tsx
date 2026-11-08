import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { displayFont, monoFont } from "@/components/home/fonts";
import { QuoteSheet } from "@/components/admin/quote-sheet";
import { AdminPage, Badge } from "@/components/admin/ui";
import { cn } from "@/lib/cn";
import { whatsappUrl } from "@/lib/links";
import { formatPrice } from "@/lib/money";
import { formatDocNumber } from "@/lib/pos";
import { todayInLima } from "@/lib/reports";
import { getDb } from "@/server/db/client";
import { getSiteSettings } from "@/server/services/content";
import { formatQuoteNumber, getQuote } from "@/server/services/quotes";
import { requireStaff } from "../../../_lib/auth";
import { QuoteActions } from "./quote-actions";

export async function generateMetadata({ params }: PageProps<"/admin/cotizaciones/[number]">): Promise<Metadata> {
  const { number } = await params;
  return { title: `Cotización ${formatQuoteNumber(Number(number) || 0)}` };
}

export const instant = false;
const day = (iso: string) => iso.split("-").reverse().join("/");

export default async function QuotePage({ params }: PageProps<"/admin/cotizaciones/[number]">) {
  await requireStaff();
  const n = Number((await params).number);
  if (!Number.isInteger(n)) notFound();
  const db = getDb();
  const [quote, settings] = await Promise.all([getQuote(db, n), getSiteSettings(db)]);
  if (!quote) notFound();
  const number = formatQuoteNumber(quote.number);
  const expired = quote.status === "vigente" && quote.validUntil < todayInLima();
  const company = { legalName: settings.company.legalName, ruc: settings.company.ruc, address: settings.company.address, phone: settings.contact.phone || settings.contact.whatsapp, email: settings.contact.email };
  const units = quote.items.reduce((s, i) => s + i.quantity, 0);
  const phone = quote.customerPhone?.replace(/\D/g, "") ?? "";
  const message = `Hola ${quote.customerName.split(" ")[0]}, te escribimos de TWENTY con la cotización ${number}: ${units} prendas por ${formatPrice(quote.totalCents)}, válida hasta el ${day(quote.validUntil)}. Te mandamos el PDF por aquí.`;
  const whatsappHref = phone.length >= 9 ? whatsappUrl(phone.length === 9 ? `51${phone}` : phone, message) : null;

  return (
    <AdminPage
      back={{ href: "/admin/cotizaciones", label: "Cotizaciones" }}
      title={
        <span className="flex flex-wrap items-center gap-3">
          {number}
          {quote.status === "vendida" ? <Badge tone="success">Vendida</Badge> : quote.status === "anulada" ? <Badge tone="danger">Anulada</Badge> : expired ? <Badge tone="warning">Vencida</Badge> : <Badge tone="info">Vigente</Badge>}
        </span>
      }
      description={`${quote.customerName} · ${units} prendas · ${formatPrice(quote.totalCents)} · válida hasta el ${day(quote.validUntil)}`}
    >
      <div className="space-y-5">
        {quote.status === "vendida" && quote.saleSeries ? (
          <p className="text-sm">
            Se vendió con la{" "}
            <Link href={`/admin/ventas-tienda/${quote.posSaleId}`} className="font-mono underline">
              {formatDocNumber(quote.saleSeries, quote.saleNumber!)}
            </Link>
            .
          </p>
        ) : null}
        {expired ? <p className="text-sm text-warning">Ya pasó su fecha de validez: revisa los precios antes de vender (o edítala para darle más días).</p> : null}
        <QuoteActions quote={quote} company={company} formattedNumber={number} fontClass={`${displayFont.variable} ${monoFont.variable}`} whatsappHref={whatsappHref} open={quote.status === "vigente"} />
        <div className={cn("w-fit max-w-full overflow-x-auto rounded-lg bg-white p-4 shadow-lg", displayFont.variable, monoFont.variable)}>
          <QuoteSheet quote={quote} company={company} formattedNumber={number} />
        </div>
      </div>
    </AdminPage>
  );
}
