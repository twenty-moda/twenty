import { Download } from "lucide-react";
import type { Metadata } from "next";
import Form from "next/form";
import type { ReactNode } from "react";
import { AdminPage, Badge, buttonClass, Card, EmptyState, FilterTabs } from "@/components/admin/ui";
import { BarList, formatCount } from "@/components/admin/visits";
import { cn } from "@/lib/cn";
import { formatPrice } from "@/lib/money";
import { PAYMENT_METHOD_LABEL } from "@/lib/order-status";
import { PAYMENT_LABEL, PAYMENT_METHODS, POS_DOCUMENT_LABEL, SALE_DOCUMENT_TYPES } from "@/lib/pos";
import { rangePresets, reportRange, type ReportRange } from "@/lib/reports";
import { getDb } from "@/server/db/client";
import { getSalesReport, getStockValuation, type SalesReport } from "@/server/services/reports";
import { requireAdmin } from "../../_lib/auth";
import { SalesChart } from "./sales-chart";

// Lee la sesión y el rango de la URL: se arma en el servidor en cada visita.
export const instant = false;
export const metadata: Metadata = { title: "Reportes" };

const plural = (n: number, one: string, many: string) => `${formatCount(n)} ${n === 1 ? one : many}`;
const average = (cents: number, count: number) => (count ? formatPrice(Math.round(cents / count)) : "—");

export default async function ReportsPage({ searchParams }: PageProps<"/admin/reportes">) {
  await requireAdmin();
  const params = await searchParams;
  const range = reportRange(params.desde, params.hasta);
  const db = getDb();
  const [report, stock] = await Promise.all([getSalesReport(db, range), getStockValuation(db)]);
  const query = `desde=${range.desde}&hasta=${range.hasta}`;

  return (
    <AdminPage
      title="Reportes"
      description="Ventas de la tienda y de la web, lo más vendido y el stock valorizado."
      actions={
        <a href={`/admin/reportes/registro-ventas?${query}`} download className={buttonClass("secondary")}>
          <Download className="size-4" aria-hidden /> Registro de ventas (CSV)
        </a>
      }
    >
      <RangeFilter range={range} />
      <SalesSummary report={report} />
      <div className="mt-6 space-y-4">
        <Card title={report.unit === "day" ? "Ventas por día" : "Ventas por mes"}>
          {report.store.count || report.web.count ? (
            <SalesChart report={report} />
          ) : (
            <EmptyState title="Sin ventas en estas fechas">Elige otras fechas arriba.</EmptyState>
          )}
        </Card>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <PaymentsCard report={report} />
          <Card title="Vendedores de la tienda">
            <BarList
              format={formatPrice}
              empty="Sin ventas en tienda en estas fechas."
              rows={report.sellers.map((s) => ({
                key: s.sellerId ?? "sin-vendedor",
                label: (
                  <>
                    {s.name ?? "Sin vendedor"}
                    <span className="block text-xs text-subtle">
                      {plural(s.count, "venta", "ventas")} · {plural(s.units, "prenda", "prendas")} · ticket {average(s.cents, s.count)}
                    </span>
                  </>
                ),
                value: s.cents,
              }))}
            />
          </Card>
        </div>
        <DocumentsCard report={report} />
        <TopModelsCard report={report} />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card title="Prendas por talla">
            <BarList rows={report.sizes.map((s) => ({ key: s.label, label: `Talla ${s.label}`, value: s.units }))} />
          </Card>
          <Card title="Prendas por color">
            <BarList rows={report.colors.map((c) => ({ key: c.label, label: c.label, value: c.units }))} />
          </Card>
        </div>
        <StockCard stock={stock} />
      </div>
    </AdminPage>
  );
}

function RangeFilter({ range }: { range: ReportRange }) {
  const presets = rangePresets();
  const href = (desde: string, hasta: string) => `/admin/reportes?desde=${desde}&hasta=${hasta}`;
  const dateClass = "h-11 rounded-xl border border-line bg-raised px-3 text-sm text-white [color-scheme:dark] outline-none focus:border-white";
  return (
    <div className="mb-5 flex flex-wrap items-end gap-3">
      <FilterTabs items={presets.map((p) => ({ href: href(p.desde, p.hasta), label: p.label, active: p.desde === range.desde && p.hasta === range.hasta }))} />
      <Form action="/admin/reportes" className="flex flex-wrap items-end gap-2">
        <label className="text-xs text-muted">
          Desde
          <input type="date" name="desde" defaultValue={range.desde} className={cn(dateClass, "mt-1 block")} />
        </label>
        <label className="text-xs text-muted">
          Hasta
          <input type="date" name="hasta" defaultValue={range.hasta} className={cn(dateClass, "mt-1 block")} />
        </label>
        <button type="submit" className={buttonClass("secondary")}>
          Ver
        </button>
      </Form>
    </div>
  );
}

function SalesSummary({ report }: { report: SalesReport }) {
  const { store, web } = report;
  const storeNet = store.cents - store.returnsCents;
  const webNet = web.cents - web.refundsCents;
  const returned = store.returnsCents + web.refundsCents;
  const count = store.count + web.count;
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Stat label="Ventas netas" value={formatPrice(storeNet + webNet)}>
        Tienda {formatPrice(storeNet)} · Web {formatPrice(webNet)}
        {returned ? <span className="block">Ya sin {formatPrice(returned)} devueltos</span> : null}
      </Stat>
      <Stat label="Ventas" value={formatCount(count)}>
        {formatCount(store.count)} en tienda · {plural(web.count, "pedido web", "pedidos web")}
      </Stat>
      <Stat label="Ticket promedio" value={average(store.cents + web.cents, count)}>
        Tienda {average(store.cents, store.count)} · Web {average(web.cents, web.count)}
      </Stat>
      <Stat label="Prendas vendidas" value={formatCount(store.units + web.units)}>
        {formatCount(store.units)} en tienda · {formatCount(web.units)} en la web
      </Stat>
    </div>
  );
}

function Stat({ label, value, children }: { label: string; value: string; children: ReactNode }) {
  return (
    <div className="h-full rounded-2xl border border-line bg-surface p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-2 text-2xl font-extrabold tracking-tight tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-subtle">{children}</p>
    </div>
  );
}

function PaymentsCard({ report }: { report: SalesReport }) {
  const store = PAYMENT_METHODS.filter((m) => report.storeMethods[m] > 0);
  const refunded = PAYMENT_METHODS.filter((m) => report.storeRefundsByMethod[m] > 0);
  return (
    <Card title="Medios de pago">
      <h3 className="mb-2 text-xs font-semibold text-muted uppercase">Tienda</h3>
      <BarList format={formatPrice} empty="Sin ventas en tienda en estas fechas." rows={store.map((m) => ({ key: m, label: PAYMENT_LABEL[m], value: report.storeMethods[m] }))} />
      {refunded.length ? (
        <p className="mt-2 text-xs text-subtle">Devuelto: {refunded.map((m) => `${PAYMENT_LABEL[m]} ${formatPrice(report.storeRefundsByMethod[m])}`).join(" · ")}</p>
      ) : null}
      <h3 className="mt-5 mb-2 text-xs font-semibold text-muted uppercase">Web</h3>
      <BarList
        format={formatPrice}
        empty="Sin pedidos pagados en estas fechas."
        rows={report.webMethods.map((m) => ({
          key: m.method,
          label: (
            <>
              {PAYMENT_METHOD_LABEL[m.method]}
              <span className="block text-xs text-subtle">{plural(m.count, "pedido", "pedidos")}</span>
            </>
          ),
          value: m.cents,
        }))}
      />
      {report.web.refundsCents ? <p className="mt-2 text-xs text-subtle">Devuelto: {formatPrice(report.web.refundsCents)}</p> : null}
    </Card>
  );
}

function DocumentsCard({ report }: { report: SalesReport }) {
  const empty = { count: 0, cents: 0, voided: 0, pending: 0, rejected: 0 };
  const docs = SALE_DOCUMENT_TYPES.map((type) => ({ ...(report.documents.find((d) => d.type === type) ?? empty), type }));
  return (
    <Card title="Comprobantes de la tienda">
      <div className="-mx-4 overflow-x-auto px-4">
        <table className="w-full min-w-[32rem] text-left text-sm">
          <thead className="text-xs text-subtle">
            <tr>
              <th className="py-1.5 font-normal">Comprobante</th>
              <th className="py-1.5 text-right font-normal">Emitidos</th>
              <th className="py-1.5 text-right font-normal">Total</th>
              <th className="py-1.5 text-right font-normal">Anulados</th>
              <th className="py-1.5 pl-4 font-normal">SUNAT</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {docs.map((d) => (
              <tr key={d.type}>
                <td className="py-2">{POS_DOCUMENT_LABEL[d.type]}</td>
                <td className="py-2 text-right tabular-nums">{formatCount(d.count)}</td>
                <td className="py-2 text-right tabular-nums">{formatPrice(d.cents)}</td>
                <td className="py-2 text-right text-muted tabular-nums">{d.voided ? formatCount(d.voided) : "—"}</td>
                <td className="py-2 pl-4">
                  {d.type === "nota_venta" ? (
                    <span className="text-subtle">No va a SUNAT</span>
                  ) : d.pending || d.rejected ? (
                    <span className="flex flex-wrap gap-1">
                      {d.pending ? <Badge tone="warning">{plural(d.pending, "pendiente", "pendientes")}</Badge> : null}
                      {d.rejected ? <Badge tone="danger">{plural(d.rejected, "rechazada", "rechazadas")}</Badge> : null}
                    </span>
                  ) : d.count ? (
                    <span className="text-muted">Todas aceptadas</span>
                  ) : (
                    <span className="text-subtle">—</span>
                  )}
                </td>
              </tr>
            ))}
            <tr>
              <td className="py-2">Devoluciones</td>
              <td className="py-2 text-right tabular-nums">{formatCount(report.store.returnsCount)}</td>
              <td className="py-2 text-right tabular-nums">{report.store.returnsCents ? `−${formatPrice(report.store.returnsCents)}` : formatPrice(0)}</td>
              <td className="py-2 text-right text-subtle">—</td>
              <td className="py-2 pl-4">
                {report.creditNotes.pending ? (
                  <Badge tone="warning">{plural(report.creditNotes.pending, "nota pendiente", "notas pendientes")}</Badge>
                ) : (
                  <span className="text-muted">{plural(report.creditNotes.count, "nota de crédito", "notas de crédito")}</span>
                )}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function TopModelsCard({ report }: { report: SalesReport }) {
  const visible = 15;
  const row = (m: SalesReport["models"][number], i: number) => (
    <tr key={m.key}>
      <td className="py-2 pr-2 text-subtle tabular-nums">{i + 1}</td>
      <td className="py-2">{m.name}</td>
      <td className="py-2 text-right text-muted tabular-nums">{formatCount(m.storeUnits)}</td>
      <td className="py-2 text-right text-muted tabular-nums">{formatCount(m.webUnits)}</td>
      <td className="py-2 text-right font-semibold tabular-nums">{formatCount(m.storeUnits + m.webUnits)}</td>
      <td className="py-2 text-right tabular-nums">{formatPrice(m.cents)}</td>
    </tr>
  );
  const head = (
    <thead className="text-xs text-subtle">
      <tr>
        <th className="w-8 py-1.5 font-normal">
          <span className="sr-only">Puesto</span>
        </th>
        <th className="py-1.5 font-normal">Modelo</th>
        <th className="py-1.5 text-right font-normal">Tienda</th>
        <th className="py-1.5 text-right font-normal">Web</th>
        <th className="py-1.5 text-right font-normal">Prendas</th>
        <th className="py-1.5 text-right font-normal">Monto</th>
      </tr>
    </thead>
  );
  const rest = report.models.slice(visible);
  return (
    <Card title="Lo más vendido">
      {report.models.length ? (
        <div className="-mx-4 overflow-x-auto px-4">
          <table className="w-full min-w-[32rem] text-left text-sm">
            {head}
            <tbody className="divide-y divide-line">{report.models.slice(0, visible).map(row)}</tbody>
          </table>
          {rest.length ? (
            <details className="group">
              <summary className="inline-flex min-h-10 cursor-pointer items-center text-sm text-muted hover:text-white group-open:hidden">
                {rest.length === 1 ? "Ver 1 más" : `Ver los otros ${rest.length}`}
              </summary>
              <table className="w-full min-w-[32rem] text-left text-sm">
                <tbody className="divide-y divide-line">{rest.map((m, i) => row(m, i + visible))}</tbody>
              </table>
            </details>
          ) : null}
          <p className="mt-3 text-xs text-subtle">Monto: lo cobrado por las prendas, con la promo y antes del descuento de la tienda. Las devoluciones no se restan.</p>
        </div>
      ) : (
        <p className="text-sm text-muted">Sin ventas en estas fechas.</p>
      )}
    </Card>
  );
}

function StockCard({ stock }: { stock: Awaited<ReturnType<typeof getStockValuation>> }) {
  const total = stock.reduce((t, w) => ({ units: t.units + w.units, priceCents: t.priceCents + w.priceCents, costCents: t.costCents + w.costCents, unitsWithoutCost: t.unitsWithoutCost + w.unitsWithoutCost }), {
    units: 0,
    priceCents: 0,
    costCents: 0,
    unitsWithoutCost: 0,
  });
  return (
    <Card title="Stock valorizado (hoy)">
      <div className="-mx-4 overflow-x-auto px-4">
        <table className="w-full min-w-[32rem] text-left text-sm">
          <thead className="text-xs text-subtle">
            <tr>
              <th className="py-1.5 font-normal">Almacén</th>
              <th className="py-1.5 text-right font-normal">Prendas</th>
              <th className="py-1.5 text-right font-normal">A precio de venta</th>
              <th className="py-1.5 text-right font-normal">Al costo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {stock.map((w) => (
              <tr key={w.warehouseId}>
                <td className="py-2">{w.name}</td>
                <td className="py-2 text-right tabular-nums">{formatCount(w.units)}</td>
                <td className="py-2 text-right tabular-nums">{formatPrice(w.priceCents)}</td>
                <td className="py-2 text-right tabular-nums">{w.units - w.unitsWithoutCost ? formatPrice(w.costCents) : "—"}</td>
              </tr>
            ))}
            {stock.length > 1 ? (
              <tr className="font-semibold">
                <td className="py-2">Total</td>
                <td className="py-2 text-right tabular-nums">{formatCount(total.units)}</td>
                <td className="py-2 text-right tabular-nums">{formatPrice(total.priceCents)}</td>
                <td className="py-2 text-right tabular-nums">{total.units - total.unitsWithoutCost ? formatPrice(total.costCents) : "—"}</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-subtle">
        El costo de cada prenda es el promedio de sus ingresos de mercadería con costo.
        {total.unitsWithoutCost ? ` ${plural(total.unitsWithoutCost, "prenda todavía no tiene", "prendas todavía no tienen")} costo y no suman en esa columna.` : ""}
      </p>
    </Card>
  );
}
