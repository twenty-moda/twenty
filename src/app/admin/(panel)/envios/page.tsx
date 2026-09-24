import type { Metadata } from "next";
import { AdminPage, Card } from "@/components/admin/ui";
import { getDb } from "@/server/db/client";
import { listDeliveryDistricts, listShippingMethods } from "@/server/services/shipping";
import { requireAdmin } from "../../_lib/auth";
import { DeliveryPricesEditor, ShippingMethodForm } from "./shipping-forms";

// El admin se arma en el servidor en cada visita (lee la sesión): no se exige navegación instantánea.
export const instant = false;
export const metadata: Metadata = { title: "Envíos" };

export default async function ShippingPage() {
  await requireAdmin();
  const db = getDb();
  const [methods, districts] = await Promise.all([listShippingMethods(db, { includeInactive: true }), listDeliveryDistricts(db)]);
  return (
    <AdminPage title="Envíos" description="Cómo se entregan los pedidos. El cliente elige primero la forma de entrega y luego solo llena lo que esa opción necesita.">
      <div className="space-y-4">
        <Card title={`Delivery Lima: precio por distrito (${districts.length} distritos)`}>
          <p className="mb-4 text-sm text-muted">Solo los distritos de esta lista ven “Delivery Lima” en el checkout. Los demás eligen agencia o recojo.</p>
          <DeliveryPricesEditor districts={districts} />
        </Card>
        {methods.map((m) => (
          <Card key={m.id} title={m.name}>
            <ShippingMethodForm method={m} />
          </Card>
        ))}
      </div>
    </AdminPage>
  );
}
