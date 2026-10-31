import { CheckCircle2, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AdminPage, buttonClass, EmptyState, formatDay } from "@/components/admin/ui";
import { couponLabel } from "@/lib/coupons";
import { formatPrice } from "@/lib/money";
import { getDb } from "@/server/db/client";
import { listCouponsAdmin } from "@/server/services/coupons";
import { requireAdmin } from "../../_lib/auth";
import { CouponStateBadge } from "./coupon-state";

export const instant = false;
export const metadata: Metadata = { title: "Cupones" };

export default async function CouponsPage({ searchParams }: PageProps<"/admin/cupones">) {
  await requireAdmin();
  const saved = (await searchParams).guardado === "1";
  const coupons = await listCouponsAdmin(getDb());

  return (
    <AdminPage
      title="Cupones"
      description="Códigos de descuento por porcentaje o monto fijo. El cliente lo escribe al pagar en la web."
      actions={
        <Link href="/admin/cupones/nuevo" className={buttonClass("primary")}>
          <Plus className="size-4" aria-hidden /> Nuevo cupón
        </Link>
      }
    >
      {saved ? (
        <p className="mb-4 flex items-center gap-2 rounded-xl bg-success/15 px-4 py-3 text-sm text-success">
          <CheckCircle2 className="size-4" aria-hidden /> Cupón guardado. Ya se puede usar en el checkout.
        </p>
      ) : null}
      {coupons.length === 0 ? (
        <EmptyState title="No hay cupones">Crea uno y compártelo con tus clientes (Instagram, WhatsApp…).</EmptyState>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {coupons.map((c) => (
            <li key={c.id}>
              <Link href={`/admin/cupones/${c.id}`} className="block h-full rounded-2xl border border-line bg-surface p-5 hover:border-white/40">
                <div className="flex items-start justify-between gap-3">
                  <p className="min-w-0 font-mono text-xl font-bold tracking-wide break-all">{c.code}</p>
                  <CouponStateBadge state={c.state} />
                </div>
                <p className="mt-1 text-sm">
                  {couponLabel(c)} de descuento{c.minSubtotalCents ? ` · desde ${formatPrice(c.minSubtotalCents)}` : ""}
                </p>
                <p className="mt-2 text-xs text-muted">
                  {c.uses} {c.uses === 1 ? "uso" : "usos"}
                  {c.usageLimit !== null ? ` de ${c.usageLimit}` : ""}
                  {c.startsAt ? ` · desde ${formatDay(c.startsAt)}` : ""}
                  {c.endsAt ? ` · vence ${formatDay(c.endsAt)}` : ""}
                </p>
                {c.description ? <p className="mt-1 line-clamp-2 text-xs text-muted">{c.description}</p> : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </AdminPage>
  );
}
