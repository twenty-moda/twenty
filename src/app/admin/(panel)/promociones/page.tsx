import { CheckCircle2, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AdminPage, Badge, buttonClass, EmptyState, formatDay } from "@/components/admin/ui";
import { promotionLabel } from "@/components/store/price";
import { getDb } from "@/server/db/client";
import { listPromotionsAdmin } from "@/server/services/admin-promotions";
import { requireAdmin } from "../../_lib/auth";

export const instant = false;
export const metadata: Metadata = { title: "Promociones" };

export default async function PromotionsPage({ searchParams }: PageProps<"/admin/promociones">) {
  await requireAdmin();
  const saved = (await searchParams).guardado === "1";
  const promotions = await listPromotionsAdmin(getDb());

  return (
    <AdminPage
      title="Promociones"
      description="“Lleva N por S/ X”. Se muestran en la tienda y se aplican solas en el carrito y el checkout."
      actions={
        <Link href="/admin/promociones/nueva" className={buttonClass("primary")}>
          <Plus className="size-4" aria-hidden /> Nueva promoción
        </Link>
      }
    >
      {saved ? (
        <p className="mb-4 flex items-center gap-2 rounded-xl bg-success/15 px-4 py-3 text-sm text-success">
          <CheckCircle2 className="size-4" aria-hidden /> Promoción guardada. La tienda ya la muestra.
        </p>
      ) : null}
      {promotions.length === 0 ? (
        <EmptyState title="No hay promociones">Crea una para que aparezca en la tienda.</EmptyState>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {promotions.map((p) => {
            return (
              <li key={p.id}>
                <Link href={`/admin/promociones/${p.id}`} className="block h-full rounded-2xl border border-line bg-surface p-5 hover:border-white/40">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-2xl font-extrabold tracking-tight">{promotionLabel(p)}</p>
                    {p.state === "apagada" ? <Badge>Apagada</Badge> : p.state === "termino" ? <Badge tone="danger">Terminó</Badge> : p.state === "programada" ? <Badge tone="info">Programada</Badge> : <Badge tone="success">Activa</Badge>}
                  </div>
                  <p className="mt-1 text-sm">{p.name}</p>
                  <p className="mt-2 text-xs text-muted">
                    {p.products} {p.products === 1 ? "producto" : "productos"}
                    {p.startsAt ? ` · desde ${formatDay(p.startsAt)}` : ""}
                    {p.endsAt ? ` · hasta ${formatDay(p.endsAt)}` : ""}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </AdminPage>
  );
}
