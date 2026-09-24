import { Mail, MessageCircle, Phone } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminPage, buttonClass, Card, formatDateTime, formatDay, StatusBadge } from "@/components/admin/ui";
import { whatsappUrl } from "@/lib/links";
import { formatPrice } from "@/lib/money";
import { formatOrderNumber } from "@/lib/order-status";
import { getDb } from "@/server/db/client";
import { getCustomer } from "@/server/services/orders";
import { requireAdmin } from "../../../_lib/auth";
import { CustomerNotesForm } from "./notes-form";

// El admin se arma en el servidor en cada visita (lee la sesión): no se exige navegación instantánea.
export const instant = false;
export const metadata: Metadata = { title: "Cliente" };

const UUID = /^[0-9a-f-]{36}$/i;

export default async function CustomerPage({ params }: PageProps<"/admin/clientes/[id]">) {
  await requireAdmin();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const customer = await getCustomer(getDb(), id);
  if (!customer) notFound();

  return (
    <AdminPage
      back={{ href: "/admin/clientes", label: "Clientes" }}
      title={customer.name}
      description={`Cliente desde ${formatDay(customer.createdAt)}`}
      actions={
        <a href={whatsappUrl(`51${customer.phone}`, `Hola ${customer.name.split(" ")[0]}, te escribimos de TWENTY.`)} target="_blank" rel="noopener noreferrer" className={buttonClass("primary")}>
          <MessageCircle className="size-4" aria-hidden /> WhatsApp
        </a>
      }
    >
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card title={`Pedidos (${customer.totalOrders})`}>
          <ul className="-my-2 divide-y divide-line">
            {customer.orders.map((o) => (
              <li key={o.id}>
                <Link href={`/admin/pedidos/${o.number}`} className="flex items-center gap-3 py-3">
                  <span className="w-14 font-mono text-sm font-semibold">{formatOrderNumber(o.number)}</span>
                  <span className="min-w-0 flex-1 text-sm text-muted">
                    {formatDateTime(o.createdAt)} · {o.units} {o.units === 1 ? "prenda" : "prendas"}
                  </span>
                  <span className="text-sm font-semibold">{formatPrice(o.totalCents)}</span>
                  <StatusBadge status={o.status} />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
        <div className="space-y-4">
          <Card title="Datos">
            <div className="space-y-2 text-sm">
              <p className="flex items-center gap-2">
                <Phone className="size-4 text-muted" aria-hidden /> <a href={`tel:${customer.phone}`}>{customer.phone}</a>
              </p>
              <p className="flex items-center gap-2">
                <Mail className="size-4 text-muted" aria-hidden /> <a href={`mailto:${customer.email}`}>{customer.email}</a>
              </p>
              {customer.documentNumber ? (
                <p className="text-muted">
                  {customer.documentType?.toUpperCase()} {customer.documentNumber}
                </p>
              ) : null}
              <div className="grid grid-cols-2 gap-2 border-t border-line pt-3">
                <div>
                  <p className="text-xs text-muted">Pedidos pagados</p>
                  <p className="text-lg font-bold">{customer.paidOrders}</p>
                </div>
                <div>
                  <p className="text-xs text-muted">Total comprado</p>
                  <p className="text-lg font-bold">{formatPrice(customer.spentCents)}</p>
                </div>
              </div>
            </div>
          </Card>
          <Card title="Notas del equipo">
            <CustomerNotesForm customerId={customer.id} notes={customer.notes} />
          </Card>
        </div>
      </div>
    </AdminPage>
  );
}
