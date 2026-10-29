import type { Metadata } from "next";
import { AdminPage, Card } from "@/components/admin/ui";
import { getDb } from "@/server/db/client";
import { listWarehouses } from "@/server/services/inventory";
import { requireAdmin } from "../../_lib/auth";
import { NewWarehouseForm, WarehouseRow } from "./warehouse-row";

// El admin se arma en el servidor en cada visita (lee la sesión): no se exige navegación instantánea.
export const instant = false;
export const metadata: Metadata = { title: "Almacenes" };

export default async function WarehousesPage() {
  await requireAdmin();
  const rows = await listWarehouses(getDb());
  return (
    <AdminPage
      title="Almacenes"
      description="Las tiendas y depósitos donde hay mercadería. El que vende en la web es el que descuenta cada compra de la tienda online."
    >
      <Card>
        <ul className="divide-y divide-line">
          {rows.map((w) => (
            <WarehouseRow key={w.id} warehouse={w} />
          ))}
        </ul>
        <div className="border-t border-line pt-4">
          <NewWarehouseForm />
        </div>
      </Card>
    </AdminPage>
  );
}
