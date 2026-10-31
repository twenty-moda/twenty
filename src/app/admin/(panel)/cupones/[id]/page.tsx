import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminPage, Card, formatDateTime, StatusBadge } from "@/components/admin/ui";
import { formatPrice } from "@/lib/money";
import { formatOrderNumber } from "@/lib/order-status";
import { getDb } from "@/server/db/client";
import { getCouponAdmin } from "@/server/services/coupons";
import { requireAdmin } from "../../../_lib/auth";
import { CouponForm } from "../coupon-form";
import { CouponStateBadge } from "../coupon-state";

// El admin se arma en el servidor en cada visita (lee la sesión): no se exige navegación instantánea.
export const instant = false;
export const metadata: Metadata = { title: "Cupón" };

/** Date → "2026-11-27T00:00" en hora de Lima, para <input type="datetime-local">. */
const toLimaInput = (d: Date | null) => (d ? new Date(d.getTime() - 5 * 60 * 60 * 1000).toISOString().slice(0, 16) : "");
const toSoles = (cents: number | null) => (cents ? String(cents / 100) : "");

export default async function CouponPage({ params }: PageProps<"/admin/cupones/[id]">) {
  await requireAdmin();
  const { id } = await params;
  const isNew = id === "nuevo";
  if (!isNew && !/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const coupon = isNew ? null : await getCouponAdmin(getDb(), id);
  if (!isNew && !coupon) notFound();

  return (
    <AdminPage
      back={{ href: "/admin/cupones", label: "Cupones" }}
      title={coupon ? <span className="font-mono break-all">{coupon.code}</span> : "Nuevo cupón"}
      actions={coupon ? <CouponStateBadge state={coupon.state} /> : null}
    >
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        <Card>
          <CouponForm
            id={coupon ? id : null}
            initial={
              coupon
                ? {
                    code: coupon.code,
                    description: coupon.description ?? "",
                    type: coupon.type,
                    value: coupon.type === "monto" ? toSoles(coupon.value) : String(coupon.value),
                    maxDiscount: toSoles(coupon.maxDiscountCents),
                    minSubtotal: toSoles(coupon.minSubtotalCents),
                    usageLimit: coupon.usageLimit === null ? "" : String(coupon.usageLimit),
                    perCustomerLimit: coupon.perCustomerLimit === null ? "" : String(coupon.perCustomerLimit),
                    firstPurchaseOnly: coupon.firstPurchaseOnly,
                    isActive: coupon.isActive,
                    startsAt: toLimaInput(coupon.startsAt),
                    endsAt: toLimaInput(coupon.endsAt),
                  }
                : undefined
            }
          />
        </Card>

        {coupon ? (
          <Card title="Usos">
            <dl className="grid grid-cols-2 gap-4">
              <div>
                <dt className="text-xs text-muted">Pedidos</dt>
                <dd className="text-2xl font-bold tabular-nums">
                  {coupon.uses}
                  {coupon.usageLimit !== null ? <span className="text-base font-normal text-muted"> de {coupon.usageLimit}</span> : null}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Descuento dado</dt>
                <dd className="text-2xl font-bold tabular-nums">{formatPrice(coupon.discountCents)}</dd>
              </div>
            </dl>
            <p className="mt-3 text-xs text-muted">Los pedidos anulados o rechazados no cuentan: su uso vuelve al cupón.</p>
            {coupon.recentOrders.length ? (
              <ul className="mt-4 divide-y divide-line border-t border-line">
                {coupon.recentOrders.map((o) => (
                  <li key={o.number}>
                    <Link href={`/admin/pedidos/${o.number}`} className="flex items-center gap-3 py-3 text-sm hover:text-white">
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">
                          {formatOrderNumber(o.number)} · {o.customerName}
                        </span>
                        <span className="block text-xs text-muted">
                          {formatDateTime(o.createdAt)} · -{formatPrice(o.couponDiscountCents)}
                        </span>
                      </span>
                      <StatusBadge status={o.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 text-sm text-muted">Todavía nadie lo usó.</p>
            )}
          </Card>
        ) : null}
      </div>
    </AdminPage>
  );
}
