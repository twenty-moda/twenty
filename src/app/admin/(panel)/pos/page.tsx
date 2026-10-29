import type { Metadata } from "next";
import { displayFont, monoFont } from "@/components/home/fonts";
import { AdminPage, EmptyState, FilterTabs } from "@/components/admin/ui";
import { getDb } from "@/server/db/client";
import { getSiteSettings } from "@/server/services/content";
import { listWarehouses } from "@/server/services/inventory";
import { getOpenSession, listPosVariants } from "@/server/services/pos";
import { requireAdmin } from "../../_lib/auth";
import { OpenCashForm } from "./open-cash-form";
import { PosScreen } from "./pos-screen";

// El admin se arma en el servidor en cada visita (lee la sesión): no se exige navegación instantánea.
export const instant = false;
export const metadata: Metadata = { title: "Punto de venta" };

export default async function PosPage({ searchParams }: PageProps<"/admin/pos">) {
  await requireAdmin();
  const { tienda } = await searchParams;
  const db = getDb();
  const warehouses = (await listWarehouses(db)).filter((w) => w.isActive);
  // Por defecto, la tienda que vende en la web (Gamarra).
  const warehouse = warehouses.find((w) => w.id === tienda) ?? warehouses.find((w) => w.sellsOnline) ?? warehouses[0];
  if (!warehouse) return <AdminPage title="Punto de venta"><EmptyState title="No hay tiendas activas" /></AdminPage>;
  const session = await getOpenSession(db, warehouse.id);

  const tabs =
    warehouses.length > 1 ? (
      <FilterTabs items={warehouses.map((w) => ({ href: `/admin/pos?tienda=${w.id}`, label: w.name, active: w.id === warehouse.id }))} />
    ) : null;

  if (!session) {
    return (
      <AdminPage title="Punto de venta" description="Para vender en la tienda, primero abre la caja.">
        <div className="space-y-5">
          {tabs}
          <OpenCashForm warehouseId={warehouse.id} warehouseName={warehouse.name} />
        </div>
      </AdminPage>
    );
  }

  const [variants, settings] = await Promise.all([listPosVariants(db, warehouse.id), getSiteSettings(db)]);
  return (
    <AdminPage title="Punto de venta">
      <div className="space-y-5">
        {tabs}
        <PosScreen
          warehouse={{ id: warehouse.id, name: warehouse.name }}
          session={{ number: session.number }}
          variants={variants}
          company={{ legalName: settings.company.legalName, ruc: settings.company.ruc }}
          fontClass={`${displayFont.variable} ${monoFont.variable}`}
        />
      </div>
    </AdminPage>
  );
}
