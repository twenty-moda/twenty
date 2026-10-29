import { ArrowDownToLine, ArrowLeftRight, ArrowUpFromLine } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AdminPage, Badge, buttonClass, EmptyState, FilterTabs, formatDateTime, Pagination, SearchBox } from "@/components/admin/ui";
import { cn } from "@/lib/cn";
import { EXIT_REASON_LABEL, formatUnits, MOVEMENT_LABEL, OPERATION_LABEL, type ExitReason } from "@/lib/inventory";
import { formatPrice } from "@/lib/money";
import { formatOrderNumber } from "@/lib/order-status";
import { getDb } from "@/server/db/client";
import { listMovements, listOperations, listWarehouses } from "@/server/services/inventory";
import { requireAdmin } from "../../_lib/auth";

// Lista filtrada por la URL (vista, almacén, búsqueda, página): se arma en el servidor en cada visita.
export const instant = false;
export const metadata: Metadata = { title: "Movimientos" };

const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

export default async function MovementsPage({ searchParams }: PageProps<"/admin/movimientos">) {
  await requireAdmin();
  const params = await searchParams;
  const kardex = params.vista === "kardex";
  const q = typeof params.q === "string" ? params.q : undefined;
  const almacen = typeof params.almacen === "string" ? params.almacen : undefined;
  const page = Number(params.pagina) || 1;
  const href = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams();
    for (const [k, v] of Object.entries({ vista: kardex ? "kardex" : undefined, q, almacen, ...patch })) if (v) next.set(k, v);
    const s = next.toString();
    return `/admin/movimientos${s ? `?${s}` : ""}`;
  };

  const db = getDb();
  const warehouses = await listWarehouses(db);
  const warehouseId = warehouses.some((w) => w.id === almacen) ? almacen : undefined;

  return (
    <AdminPage
      title="Movimientos"
      description="Ingresos, traslados y salidas de mercadería, y el kardex con cada cambio de stock (también las ventas de la web)."
      actions={
        <>
          <Link href="/admin/movimientos/nuevo?tipo=ingreso" className={buttonClass("primary")}>
            <ArrowDownToLine className="size-4" aria-hidden /> Ingreso
          </Link>
          <Link href="/admin/movimientos/nuevo?tipo=traslado" className={buttonClass("secondary")}>
            <ArrowLeftRight className="size-4" aria-hidden /> Traslado
          </Link>
          <Link href="/admin/movimientos/nuevo?tipo=salida" className={buttonClass("secondary")}>
            <ArrowUpFromLine className="size-4" aria-hidden /> Salida
          </Link>
        </>
      }
    >
      <div className="mb-5 space-y-4">
        <FilterTabs
          items={[
            { href: "/admin/movimientos", label: "Operaciones", active: !kardex },
            { href: "/admin/movimientos?vista=kardex", label: "Kardex", active: kardex },
          ]}
        />
        {kardex ? (
          <>
            <SearchBox placeholder="Buscar SKU o producto" defaultValue={q} hidden={{ vista: "kardex", almacen: warehouseId }} />
            <FilterTabs
              items={[
                { href: href({ almacen: undefined, pagina: undefined }), label: "Todos los almacenes", active: !warehouseId },
                ...warehouses.map((w) => ({ href: href({ almacen: w.id, pagina: undefined }), label: w.name, active: warehouseId === w.id })),
              ]}
            />
          </>
        ) : null}
      </div>
      {kardex ? <Kardex q={q} warehouseId={warehouseId} page={page} href={href} /> : <Operations page={page} href={href} />}
    </AdminPage>
  );
}

async function Operations({ page, href }: { page: number; href: (patch: Record<string, string | undefined>) => string }) {
  const result = await listOperations(getDb(), { page });
  if (result.rows.length === 0) {
    return <EmptyState title="Aún no hay operaciones">Registra un ingreso cuando llegue mercadería o un traslado entre almacenes.</EmptyState>;
  }
  return (
    <>
      <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line">
        {result.rows.map((o) => (
          <li key={o.id}>
            <Link href={`/admin/movimientos/${o.number}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-surface">
              <span className="w-14 font-mono font-semibold">#{o.number}</span>
              <span className="min-w-[12rem] flex-1">
                <span className="font-medium">{OPERATION_LABEL[o.kind]}</span>
                <span className="block text-xs text-muted">
                  {o.kind === "traslado" ? `${o.fromName} → ${o.toName}` : (o.toName ?? o.fromName)}
                  {o.kind === "salida" && o.reason ? ` · ${EXIT_REASON_LABEL[o.reason as ExitReason] ?? MOVEMENT_LABEL[o.reason]}` : ""}
                </span>
              </span>
              <span className="text-sm tabular-nums">
                {formatUnits(o.units)} · {o.lines} {o.lines === 1 ? "prenda" : "prendas"}
              </span>
              <span className="w-full text-xs text-subtle sm:w-44 sm:text-right">
                {formatDateTime(o.createdAt)}
                {o.userName ? ` · ${o.userName}` : ""}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <Pagination page={result.page} pageCount={result.pageCount} href={(p) => href({ pagina: String(p) })} />
    </>
  );
}

async function Kardex({ q, warehouseId, page, href }: { q?: string; warehouseId?: string; page: number; href: (patch: Record<string, string | undefined>) => string }) {
  const result = await listMovements(getDb(), { q, warehouseId, page });
  if (result.rows.length === 0) return <EmptyState title={q ? `Sin movimientos para “${q}”` : "Sin movimientos"} />;
  return (
    <>
      <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line">
        {result.rows.map((m) => (
          <li key={m.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm">
            <span className="min-w-[12rem] flex-1">
              <Link href={`/admin/productos/${m.productId}`} className="font-medium hover:underline">
                {m.productName}
              </Link>{" "}
              · {m.colorName} · Talla {m.sizeLabel}
              <span className="block font-mono text-xs text-subtle">{m.sku}</span>
            </span>
            <span className="flex min-w-[11rem] flex-wrap items-center gap-2">
              <Badge tone={m.quantity > 0 ? "success" : "neutral"}>{MOVEMENT_LABEL[m.type]}</Badge>
              <span className="text-xs text-muted">{m.warehouseCode}</span>
            </span>
            <span className="w-24 text-right tabular-nums">
              <span className={cn("font-semibold", m.quantity > 0 ? "text-success" : "text-white")}>{signed(m.quantity)}</span>
              <span className="block text-xs text-muted">Saldo {m.balanceAfter}</span>
            </span>
            <span className="w-full text-xs text-subtle sm:w-52 sm:text-right">
              {formatDateTime(m.createdAt)}
              {m.userName ? ` · ${m.userName}` : ""}
              {m.orderNumber ? (
                <>
                  {" · "}
                  <Link href={`/admin/pedidos/${m.orderNumber}`} className="hover:text-white hover:underline">
                    Pedido {formatOrderNumber(m.orderNumber)}
                  </Link>
                </>
              ) : null}
              {m.operationNumber ? (
                <>
                  {" · "}
                  <Link href={`/admin/movimientos/${m.operationNumber}`} className="hover:text-white hover:underline">
                    Operación #{m.operationNumber}
                  </Link>
                </>
              ) : null}
              {m.unitCostCents ? ` · Costo ${formatPrice(m.unitCostCents)}` : ""}
              {m.note && !m.operationNumber ? <span className="block text-muted">{m.note}</span> : null}
            </span>
          </li>
        ))}
      </ul>
      <Pagination page={result.page} pageCount={result.pageCount} href={(p) => href({ pagina: String(p) })} />
    </>
  );
}
