import type { Metadata } from "next";
import { displayFont, monoFont } from "@/components/home/fonts";
import { AdminPage } from "@/components/admin/ui";
import { getDb } from "@/server/db/client";
import { getOperation, listPickerVariants, listWarehouses } from "@/server/services/inventory";
import { requireAdmin } from "../../_lib/auth";
import { LabelSheet } from "./label-sheet";

export const instant = false;
export const metadata: Metadata = { title: "Etiquetas" };

export default async function LabelsPage({ searchParams }: PageProps<"/admin/etiquetas">) {
  await requireAdmin();
  const { operacion } = await searchParams;
  const db = getDb();
  const [variants, warehouses, operation] = await Promise.all([
    listPickerVariants(db),
    listWarehouses(db),
    Number.isInteger(Number(operacion)) ? getOperation(db, Number(operacion)) : null,
  ]);
  // Desde un ingreso o traslado: una etiqueta por cada unidad que entró.
  const initialLines = operation ? operation.lines.filter((l) => l.quantity > 0).map((l) => ({ variantId: l.variantId, quantity: l.quantity })) : [];

  return (
    <AdminPage
      title="Etiquetas"
      description={
        operation
          ? `Las prendas de la operación #${operation.number}, una etiqueta por unidad que entró.`
          : "Etiquetas con código de barras por talla y color, para el lector de la tienda. Funcionan en impresoras de etiquetas (rollo) o en hojas A4 adhesivas."
      }
      back={operation ? { href: `/admin/movimientos/${operation.number}`, label: `Operación #${operation.number}` } : undefined}
    >
      <LabelSheet
        variants={variants}
        warehouses={warehouses.filter((w) => w.isActive).map(({ id, name }) => ({ id, name }))}
        initialLines={initialLines}
        initialWarehouseId={operation?.toWarehouseId ?? undefined}
        fontClass={`${displayFont.variable} ${monoFont.variable}`}
      />
    </AdminPage>
  );
}
