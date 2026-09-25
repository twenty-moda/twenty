import type { Metadata } from "next";
import { AdminPage, Card } from "@/components/admin/ui";
import { getDb } from "@/server/db/client";
import { getCatalogOptions } from "@/server/services/admin-products";
import { requireAdmin } from "../../../_lib/auth";
import { ProductForm } from "../product-form";

// El admin se arma en el servidor en cada visita (lee la sesión): no se exige navegación instantánea.
export const instant = false;
export const metadata: Metadata = { title: "Nuevo producto" };

export default async function NewProductPage({ searchParams }: PageProps<"/admin/productos/nuevo">) {
  await requireAdmin();
  const outfit = (await searchParams).tipo === "conjunto";
  const options = await getCatalogOptions(getDb());
  return (
    <AdminPage
      back={{ href: "/admin/productos", label: "Productos" }}
      title={outfit ? "Nuevo conjunto" : "Nuevo producto"}
      description={
        outfit
          ? "Paso 1: los datos. Luego eliges sus prendas (el cliente escoge color y talla de cada una), el precio del conjunto y sus fotos."
          : "Paso 1: los datos. Luego agregas variantes (color y talla) y fotos. ¿Son muchos? Usa la carga masiva con Excel."
      }
    >
      <Card>
        <ProductForm productId={null} kind={outfit ? "outfit" : "single"} categories={options.categories} fits={options.fits} />
      </Card>
    </AdminPage>
  );
}
