import type { Metadata } from "next";
import { AdminPage, Card } from "@/components/admin/ui";
import { FORMAT_HINT, IMAGE_SPECS, specLabel } from "@/lib/image-specs";
import { getDb } from "@/server/db/client";
import { listTaxonomy } from "@/server/services/admin-products";
import { requireAdmin } from "../../_lib/auth";
import { NewTaxonForm, TaxonRow } from "./taxon-row";

// El admin se arma en el servidor en cada visita (lee la sesión): no se exige navegación instantánea.
export const instant = false;
export const metadata: Metadata = { title: "Categorías" };

export default async function TaxonomyPage() {
  await requireAdmin();
  const { categories, fits } = await listTaxonomy(getDb());
  return (
    <AdminPage title="Categorías y fits" description="Las categorías arman el menú de la tienda; los fits (cortes) sirven de filtro en el catálogo.">
      <div className="space-y-4">
        <Card title="Categorías">
          <p className="mb-2 text-sm text-muted">
            El número es el orden en el menú (0 va primero). La imagen se ve en “Compra por categoría”: ideal {specLabel(IMAGE_SPECS.category)}. {FORMAT_HINT}
          </p>
          <ul className="divide-y divide-line">
            {categories.map((c) => (
              <TaxonRow key={c.id} kind="category" taxon={c} />
            ))}
          </ul>
          <div className="border-t border-line pt-4">
            <NewTaxonForm kind="category" />
          </div>
        </Card>
        <Card title="Fits / cortes">
          <ul className="divide-y divide-line">
            {fits.map((f) => (
              <TaxonRow key={f.id} kind="fit" taxon={f} />
            ))}
          </ul>
          <div className="border-t border-line pt-4">
            <NewTaxonForm kind="fit" />
          </div>
        </Card>
      </div>
    </AdminPage>
  );
}
