import type { Metadata } from "next";
import { AdminPage, EmptyState } from "@/components/admin/ui";
import { getDb } from "@/server/db/client";
import { listWarehouses } from "@/server/services/inventory";
import { listPosVariants } from "@/server/services/pos";
import { requireStaff } from "../../../_lib/auth";
import { QuoteForm } from "../quote-form";

export const instant = false;
export const metadata: Metadata = { title: "Nueva cotización" };

export default async function NewQuotePage() {
  await requireStaff();
  const db = getDb();
  const warehouses = (await listWarehouses(db)).filter((w) => w.isActive);
  // La tienda que vende (Gamarra): de ahí sale la venta cuando el cliente confirma.
  const warehouse = warehouses.find((w) => w.sellsOnline) ?? warehouses[0];
  if (!warehouse) return <AdminPage title="Nueva cotización"><EmptyState title="No hay tiendas activas" /></AdminPage>;
  const variants = (await listPosVariants(db, warehouse.id)).filter((v) => v.isActive);
  return (
    <AdminPage title="Nueva cotización" back={{ href: "/admin/cotizaciones", label: "Cotizaciones" }} description="Para clientes mayoristas: el precio por unidad puede ser menor que el de lista. No reserva stock.">
      <QuoteForm warehouse={{ id: warehouse.id, name: warehouse.name }} variants={variants} />
    </AdminPage>
  );
}
