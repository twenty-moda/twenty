import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AdminPage, Card } from "@/components/admin/ui";
import { getDb } from "@/server/db/client";
import { getPromotionAdmin, listPromotableProducts } from "@/server/services/admin-promotions";
import { requireAdmin } from "../../../_lib/auth";
import { PromotionForm } from "../promotion-form";

// El admin se arma en el servidor en cada visita (lee la sesión): no se exige navegación instantánea.
export const instant = false;
export const metadata: Metadata = { title: "Promoción" };

/** Date → "2026-11-27T00:00" en hora de Lima, para <input type="datetime-local">. */
const toLimaInput = (d: Date | null) => (d ? new Date(d.getTime() - 5 * 60 * 60 * 1000).toISOString().slice(0, 16) : "");

export default async function PromotionPage({ params }: PageProps<"/admin/promociones/[id]">) {
  await requireAdmin();
  const { id } = await params;
  const db = getDb();
  const isNew = id === "nueva";
  if (!isNew && !/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [promotion, products] = await Promise.all([isNew ? null : getPromotionAdmin(db, id), listPromotableProducts(db)]);
  if (!isNew && !promotion) notFound();

  return (
    <AdminPage back={{ href: "/admin/promociones", label: "Promociones" }} title={isNew ? "Nueva promoción" : promotion!.name}>
      <Card>
        <PromotionForm
          id={isNew ? null : id}
          products={products}
          initial={
            promotion
              ? {
                  name: promotion.name,
                  description: promotion.description,
                  quantity: promotion.quantity,
                  bundlePriceCents: promotion.bundlePriceCents,
                  isActive: promotion.isActive,
                  startsAt: toLimaInput(promotion.startsAt),
                  endsAt: toLimaInput(promotion.endsAt),
                  productIds: promotion.productIds,
                }
              : undefined
          }
        />
      </Card>
    </AdminPage>
  );
}
