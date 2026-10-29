import type { Metadata } from "next";
import { AdminPage } from "@/components/admin/ui";
import { OPERATION_KINDS, type OperationKind } from "@/lib/inventory";
import { getDb } from "@/server/db/client";
import { listPickerVariants, listWarehouses } from "@/server/services/inventory";
import { requireAdmin } from "../../../_lib/auth";
import { OperationForm } from "./operation-form";

export const instant = false;
export const metadata: Metadata = { title: "Nuevo movimiento" };

export default async function NewOperationPage({ searchParams }: PageProps<"/admin/movimientos/nuevo">) {
  await requireAdmin();
  const { tipo } = await searchParams;
  const kind: OperationKind = OPERATION_KINDS.includes(tipo as OperationKind) ? (tipo as OperationKind) : "ingreso";
  const db = getDb();
  const [warehouses, variants] = await Promise.all([listWarehouses(db), listPickerVariants(db)]);
  const active = warehouses.filter((w) => w.isActive).map(({ id, name, code, sellsOnline }) => ({ id, name, code, sellsOnline }));
  return (
    <AdminPage
      title="Nuevo movimiento"
      back={{ href: "/admin/movimientos", label: "Movimientos" }}
      description="Ingreso de mercadería (del taller o un proveedor), traslado entre almacenes o salida sin venta. Todo queda en el kardex."
    >
      <OperationForm warehouses={active} variants={variants} initialKind={kind} />
    </AdminPage>
  );
}
