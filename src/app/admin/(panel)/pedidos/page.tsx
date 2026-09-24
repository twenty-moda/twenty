import type { Metadata } from "next";
import Link from "next/link";
import { AdminPage, EmptyState, FilterTabs, formatDateTime, Pagination, SearchBox, StatusBadge } from "@/components/admin/ui";
import { formatPrice } from "@/lib/money";
import { formatOrderNumber, ORDER_STATUSES, OPEN_STATUSES, STATUS_INFO, type OrderStatus } from "@/lib/order-status";
import { getDb } from "@/server/db/client";
import { countOrdersByStatus, listOrders } from "@/server/services/orders";
import { requireAdmin } from "../../_lib/auth";

// Lista filtrada por la URL (estado, búsqueda, página): se arma en el servidor en cada visita.
export const instant = false;

export const metadata: Metadata = { title: "Pedidos" };

const PAYMENT_LABEL = { yape_plin: "Yape/Plin QR", whatsapp: "WhatsApp", tarjeta: "Tarjeta/Yape (Culqi)" } as const;

export default async function OrdersPage({ searchParams }: PageProps<"/admin/pedidos">) {
  await requireAdmin();
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q : undefined;
  const page = Number(params.pagina) || 1;
  const estado = typeof params.estado === "string" ? params.estado : undefined;
  const status = estado === "abiertos" || ORDER_STATUSES.includes(estado as OrderStatus) ? (estado as OrderStatus | "abiertos") : undefined;

  const db = getDb();
  const [result, counts] = await Promise.all([listOrders(db, { status, q, page }), countOrdersByStatus(db)]);
  const open = OPEN_STATUSES.reduce((s, x) => s + (counts[x] ?? 0), 0);
  const all = Object.values(counts).reduce((s, n) => s + (n ?? 0), 0);
  const href = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams();
    const merged = { estado, q, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) next.set(k, v);
    const s = next.toString();
    return `/admin/pedidos${s ? `?${s}` : ""}`;
  };

  const tabs = [
    { href: href({ estado: undefined, pagina: undefined }), label: "Todos", count: all, active: !status },
    { href: href({ estado: "abiertos", pagina: undefined }), label: "Por atender", count: open, active: status === "abiertos" },
    ...ORDER_STATUSES.map((s) => ({ href: href({ estado: s, pagina: undefined }), label: STATUS_INFO[s].label, count: counts[s] ?? 0, active: status === s })),
  ];

  return (
    <AdminPage title="Pedidos" description="Todo lo que llega desde la web. Toca un pedido para atenderlo.">
      <div className="space-y-4">
        <SearchBox placeholder="Buscar por #, nombre, celular o DNI" defaultValue={q} hidden={{ estado }} />
        <FilterTabs items={tabs} />
      </div>

      <div className="mt-5">
        {result.rows.length === 0 ? (
          <EmptyState title={q ? `Sin resultados para “${q}”` : "No hay pedidos aquí"}>
            {status ? <Link href="/admin/pedidos" className="underline">Ver todos los pedidos</Link> : "Cuando alguien compre, aparecerá aquí."}
          </EmptyState>
        ) : (
          <>
            {/* Móvil: tarjetas */}
            <ul className="space-y-2 lg:hidden">
              {result.rows.map((o) => (
                <li key={o.id}>
                  <Link href={`/admin/pedidos/${o.number}`} className="block rounded-2xl border border-line bg-surface p-4">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono font-semibold">{formatOrderNumber(o.number)}</span>
                      <StatusBadge status={o.status} />
                    </div>
                    <p className="mt-2 font-medium">{o.customerName}</p>
                    <div className="mt-1 flex items-center justify-between text-sm text-muted">
                      <span>
                        {o.units} {o.units === 1 ? "prenda" : "prendas"} · {o.shippingMethodName}
                      </span>
                      <span className="font-semibold text-white">{formatPrice(o.totalCents)}</span>
                    </div>
                    <p className="mt-1 text-xs text-subtle">{formatDateTime(o.createdAt)}</p>
                  </Link>
                </li>
              ))}
            </ul>

            {/* Escritorio: tabla */}
            <div className="hidden overflow-hidden rounded-2xl border border-line lg:block">
              <table className="w-full text-sm">
                <thead className="bg-surface text-left text-xs text-muted">
                  <tr>
                    <th className="px-4 py-3 font-medium">Pedido</th>
                    <th className="px-4 py-3 font-medium">Cliente</th>
                    <th className="px-4 py-3 font-medium">Entrega</th>
                    <th className="px-4 py-3 font-medium">Pago</th>
                    <th className="px-4 py-3 text-right font-medium">Total</th>
                    <th className="px-4 py-3 font-medium">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {result.rows.map((o) => (
                    <tr key={o.id} className="group hover:bg-surface">
                      <td className="px-4 py-3">
                        <Link href={`/admin/pedidos/${o.number}`} className="font-mono font-semibold group-hover:underline">
                          {formatOrderNumber(o.number)}
                        </Link>
                        <span className="block text-xs text-subtle">{formatDateTime(o.createdAt)}</span>
                      </td>
                      <td className="px-4 py-3">
                        {o.customerName}
                        <span className="block text-xs text-subtle">{o.phone}</span>
                      </td>
                      <td className="px-4 py-3">
                        {o.shippingMethodName}
                        {o.district ? <span className="block text-xs text-subtle">{o.district}</span> : null}
                      </td>
                      <td className="px-4 py-3 text-muted">{PAYMENT_LABEL[o.paymentMethod]}</td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums">{formatPrice(o.totalCents)}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={o.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={result.page} pageCount={result.pageCount} href={(p) => href({ pagina: String(p) })} />
          </>
        )}
      </div>
    </AdminPage>
  );
}
