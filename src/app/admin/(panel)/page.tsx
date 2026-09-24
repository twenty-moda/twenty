import { AlertTriangle, ArrowRight, BookOpenText, Inbox } from "lucide-react";
import Link from "next/link";
import { AdminPage, Card, EmptyState, formatDateTime, StatusBadge } from "@/components/admin/ui";
import { formatPrice } from "@/lib/money";
import { formatOrderNumber, STATUS_INFO, type OrderStatus } from "@/lib/order-status";
import { getDb } from "@/server/db/client";
import { listComplaints } from "@/server/services/complaints";
import { countNewMessages } from "@/server/services/messages";
import { getDashboard } from "@/server/services/orders";
import { requireAdmin } from "../_lib/auth";

// El admin se arma en el servidor en cada visita (lee la sesión): no se exige navegación instantánea.
export const instant = false;

export default async function AdminDashboardPage() {
  const admin = await requireAdmin();
  const db = getDb();
  const [data, complaints, newMessages] = await Promise.all([getDashboard(db), listComplaints(db, { filter: "pendientes", pageSize: 50 }), countNewMessages(db)]);
  // El reclamo que vence primero (la lista viene del más nuevo al más antiguo).
  const nextDeadline = complaints.rows.reduce<number | null>((min, c) => (c.daysLeft !== null && (min === null || c.daysLeft < min) ? c.daysLeft : min), null);
  const attention: OrderStatus[] = ["pendiente", "por_verificar", "pagado", "en_preparacion"];

  return (
    <AdminPage title={`Hola, ${admin.name.split(" ")[0]}`} description="Así va la tienda hoy.">
      {complaints.total || newMessages ? (
        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {complaints.total ? (
            <Link href="/admin/reclamos" className="flex items-center gap-3 rounded-2xl border border-danger/50 bg-danger/10 p-4">
              <BookOpenText className="size-5 shrink-0 text-danger" aria-hidden />
              <span className="min-w-0 flex-1 text-sm">
                <span className="block font-semibold">
                  {complaints.total} {complaints.total === 1 ? "reclamo por responder" : "reclamos por responder"}
                </span>
                <span className="block text-muted">
                  {nextDeadline === null
                    ? "Revisa el plazo"
                    : nextDeadline < 0
                      ? "Hay uno vencido: respóndelo hoy"
                      : nextDeadline === 0
                        ? "Uno vence hoy"
                        : `El próximo vence en ${nextDeadline} ${nextDeadline === 1 ? "día hábil" : "días hábiles"}`}
                </span>
              </span>
              <ArrowRight className="size-4 text-muted" aria-hidden />
            </Link>
          ) : null}
          {newMessages ? (
            <Link href="/admin/mensajes" className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-4">
              <Inbox className="size-5 shrink-0" aria-hidden />
              <span className="min-w-0 flex-1 text-sm">
                <span className="block font-semibold">
                  {newMessages} {newMessages === 1 ? "mensaje nuevo" : "mensajes nuevos"}
                </span>
                <span className="block text-muted">Del formulario de contacto</span>
              </span>
              <ArrowRight className="size-4 text-muted" aria-hidden />
            </Link>
          ) : null}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Pedidos hoy" value={String(data.ordersToday)} />
        <Stat label="Ventas hoy" value={formatPrice(data.salesTodayCents)} hint="Pedidos pagados" />
        <Stat label="Ventas 30 días" value={formatPrice(data.sales30Cents)} hint={`${data.orders30} pedidos pagados`} />
        <Stat label="Por atender" value={String(data.open)} href="/admin/pedidos?estado=abiertos" highlight={data.open > 0} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card
          title="Pedidos recientes"
          actions={
            <Link href="/admin/pedidos" className="inline-flex items-center gap-1 text-sm text-muted hover:text-white">
              Ver todos <ArrowRight className="size-4" aria-hidden />
            </Link>
          }
        >
          {data.recent.length ? (
            <ul className="-my-2 divide-y divide-line">
              {data.recent.map((o) => (
                <li key={o.id}>
                  <Link href={`/admin/pedidos/${o.number}`} className="flex items-center gap-3 py-3">
                    <span className="w-14 shrink-0 font-mono text-sm font-semibold">{formatOrderNumber(o.number)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{o.customerName}</span>
                      <span className="block text-xs text-muted">{formatDateTime(o.createdAt)}</span>
                    </span>
                    <span className="hidden text-sm font-semibold sm:block">{formatPrice(o.totalCents)}</span>
                    <StatusBadge status={o.status} />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="Aún no hay pedidos">Cuando alguien compre en la web, aparecerá aquí.</EmptyState>
          )}
        </Card>

        <div className="space-y-4">
          <Card title="Por estado">
            <ul className="space-y-2">
              {attention.map((s) => (
                <li key={s}>
                  <Link href={`/admin/pedidos?estado=${s}`} className="flex items-center justify-between rounded-xl px-3 py-2 hover:bg-raised">
                    <span className="text-sm">{STATUS_INFO[s].label}</span>
                    <span className="font-semibold tabular-nums">{data.byStatus[s] ?? 0}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>

          <Card
            title={
              <span className="flex items-center gap-2">
                <AlertTriangle className="size-4 text-warning" aria-hidden /> Stock bajo
              </span>
            }
            actions={
              <Link href="/admin/inventario?bajo=1" className="text-sm text-muted hover:text-white">
                Ver
              </Link>
            }
          >
            {data.lowStock.length ? (
              <ul className="space-y-2 text-sm">
                {data.lowStock.map((v) => (
                  <li key={v.variantId} className="flex justify-between gap-3">
                    <Link href={`/admin/productos/${v.productId}`} className="min-w-0 truncate hover:underline">
                      {v.productName} <span className="text-subtle">· {v.sku}</span>
                    </Link>
                    <span className={v.stock === 0 ? "font-semibold text-danger" : "text-warning"}>{v.stock === 0 ? "Agotado" : `${v.stock} und.`}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">Todo con stock.</p>
            )}
          </Card>
        </div>
      </div>
    </AdminPage>
  );
}

function Stat({ label, value, hint, href, highlight }: { label: string; value: string; hint?: string; href?: string; highlight?: boolean }) {
  const body = (
    <div className={`h-full rounded-2xl border p-4 ${highlight ? "border-warning/60 bg-warning/10" : "border-line bg-surface"}`}>
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-2 text-2xl font-extrabold tracking-tight tabular-nums">{value}</p>
      {hint ? <p className="mt-1 text-xs text-subtle">{hint}</p> : null}
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}
