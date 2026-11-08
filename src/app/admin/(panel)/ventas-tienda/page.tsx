import { FileSpreadsheet } from "lucide-react";
import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { AdminPage, Badge, buttonClass, Card, EmptyState, FilterTabs, formatDateTime, Pagination, SearchBox } from "@/components/admin/ui";
import { selectClass, SelectWrap } from "@/components/ui/form";
import { cn } from "@/lib/cn";
import { formatPrice } from "@/lib/money";
import { DOCUMENT_LABEL } from "@/lib/order-status";
import { PANEL_ROLE_LABEL, isPanelRole } from "@/lib/panel-access";
import { formatDocNumber, PAYMENT_LABEL, POS_DOCUMENT_LABEL, SALE_CHANNELS, type PaymentMethod, type SaleChannel } from "@/lib/pos";
import { dayPresets, dayRange, type ReportRange } from "@/lib/reports";
import { getDb } from "@/server/db/client";
import { listReceiptReturns, listReceiptSales, listSellers, receiptCounts, RECEIPT_TABS, type ReceiptSale, type ReceiptTab } from "@/server/services/receipts";
import { requireStaff } from "../../_lib/auth";

// Filtros en la URL (pestaña, fechas, vendedor, búsqueda): se arma en el servidor en cada visita.
export const instant = false;
export const metadata: Metadata = { title: "Comprobantes" };

const TAB_LABEL: Record<ReceiptTab, string> = { todos: "Todos", nota_venta: "Notas de venta", boleta: "Boletas", factura: "Facturas", devoluciones: "Devoluciones" };
const SUNAT_BADGE = {
  aceptado: { tone: "success", label: "Aceptado" },
  pendiente: { tone: "warning", label: "Pendiente" },
  rechazado: { tone: "danger", label: "Rechazado" },
} as const;

const methodsLabel = (methods: string | null) =>
  (methods ?? "")
    .split(",")
    .filter(Boolean)
    .map((m) => PAYMENT_LABEL[m as PaymentMethod] ?? m)
    .join(" + ");

/**
 * Comprobantes de la tienda por tipo y por día (pedido de TWENTY: verificar cada comprobante cuando no cuadra). Por
 * defecto, los de hoy. Cada pestaña dice cuántos hay, cuánto suman, los anulados y los que faltan en SUNAT.
 */
export default async function ReceiptsPage({ searchParams }: PageProps<"/admin/ventas-tienda">) {
  await requireStaff();
  const params = await searchParams;
  const tab: ReceiptTab = RECEIPT_TABS.includes(params.tipo as ReceiptTab) ? (params.tipo as ReceiptTab) : "todos";
  const range = dayRange(params.desde, params.hasta);
  const q = typeof params.q === "string" && params.q.trim() ? params.q : undefined;
  const sellerId = typeof params.vendedor === "string" && /^[0-9a-f-]{36}$/i.test(params.vendedor) ? params.vendedor : undefined;
  const channel = SALE_CHANNELS.includes(params.canal as SaleChannel) ? (params.canal as SaleChannel) : undefined;
  const page = Number(params.pagina) || 1;
  const db = getDb();
  const filter = { range, sellerId, q, channel };
  const [counts, sellers, sales, returns] = await Promise.all([
    receiptCounts(db, filter),
    listSellers(db),
    tab === "devoluciones" ? null : listReceiptSales(db, { ...filter, documentType: tab === "todos" ? undefined : tab, page }),
    tab === "devoluciones" ? listReceiptReturns(db, filter) : null,
  ]);
  const query = (over: Record<string, string | undefined>) => {
    const base = { tipo: tab === "todos" ? undefined : tab, desde: range.desde, hasta: range.hasta, vendedor: sellerId, canal: channel, q, ...over };
    return `?${new URLSearchParams(Object.entries(base).filter((e): e is [string, string] => !!e[1]))}`;
  };
  const tabCount = (t: ReceiptTab) => (t === "todos" ? counts.all.count : t === "devoluciones" ? counts.returns.count : counts[t].count);

  return (
    <AdminPage
      title="Comprobantes"
      description="Las ventas de la tienda por comprobante. Toca uno para ver o reimprimir el ticket, o anularlo."
      actions={
        <>
          <a href={`/admin/ventas-tienda/comprobantes.xlsx${query({ pagina: undefined })}`} className={buttonClass("secondary")}>
            <FileSpreadsheet className="size-4" aria-hidden /> Exportar Excel
          </a>
          <Link href="/admin/pos" className={buttonClass("primary")}>
            Vender
          </Link>
        </>
      }
    >
      <div className="space-y-4">
        <DateFilter range={range} query={query} tab={tab} sellerId={sellerId} q={q} channel={channel} />
        <div className="flex flex-wrap items-center gap-3">
          <SearchBox placeholder="Buscar B005-12, cliente o DNI" defaultValue={q} hidden={{ tipo: tab === "todos" ? undefined : tab, desde: range.desde, hasta: range.hasta, vendedor: sellerId, canal: channel }} />
          <Form action="/admin/ventas-tienda" className="flex flex-wrap items-center gap-2">
            {Object.entries({ tipo: tab === "todos" ? undefined : tab, desde: range.desde, hasta: range.hasta, q }).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
            <SelectWrap>
              <select name="canal" defaultValue={channel ?? ""} aria-label="Canal" className={cn(selectClass, "h-11 w-44 text-sm")}>
                <option value="">Tienda y virtual</option>
                <option value="tienda">Solo en tienda</option>
                <option value="virtual">Solo virtual</option>
              </select>
            </SelectWrap>
            {sellers.length > 1 ? (
              <SelectWrap>
                <select name="vendedor" defaultValue={sellerId ?? ""} aria-label="Vendedor" className={cn(selectClass, "h-11 w-56 text-sm")}>
                  <option value="">Todos los vendedores</option>
                  {sellers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                      {isPanelRole(s.role) && s.role !== "admin" ? ` · ${PANEL_ROLE_LABEL[s.role]}` : ""}
                    </option>
                  ))}
                </select>
              </SelectWrap>
            ) : null}
            <button type="submit" className={buttonClass("secondary")}>
              Filtrar
            </button>
          </Form>
        </div>

        <FilterTabs items={RECEIPT_TABS.map((t) => ({ href: query({ tipo: t === "todos" ? undefined : t, pagina: undefined }), label: TAB_LABEL[t], count: tabCount(t), active: t === tab }))} />
        <Summary tab={tab} counts={counts} />

        {sales ? (
          sales.rows.length === 0 ? (
            <EmptyState title={q ? `Sin resultados para “${q}”` : "Sin comprobantes en estas fechas"} />
          ) : (
            <>
              <SalesTable rows={sales.rows} />
              <Pagination page={sales.page} pageCount={sales.pageCount} href={(p) => `/admin/ventas-tienda${query({ pagina: String(p) })}`} />
            </>
          )
        ) : returns?.length ? (
          <ReturnsTable rows={returns} />
        ) : (
          <EmptyState title="Sin devoluciones en estas fechas" />
        )}
      </div>
    </AdminPage>
  );
}

function DateFilter({
  range,
  query,
  tab,
  sellerId,
  q,
  channel,
}: {
  range: ReportRange;
  query: (over: Record<string, string | undefined>) => string;
  tab: ReceiptTab;
  sellerId?: string;
  q?: string;
  channel?: SaleChannel;
}) {
  const dateClass = "h-11 rounded-xl border border-line bg-raised px-3 text-sm text-white [color-scheme:dark] outline-none focus:border-white";
  return (
    <div className="flex flex-wrap items-end gap-3">
      <FilterTabs items={dayPresets().map((p) => ({ href: query({ desde: p.desde, hasta: p.hasta, pagina: undefined }), label: p.label, active: p.desde === range.desde && p.hasta === range.hasta }))} />
      <Form action="/admin/ventas-tienda" className="flex flex-wrap items-end gap-2">
        {Object.entries({ tipo: tab === "todos" ? undefined : tab, vendedor: sellerId, canal: channel, q }).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
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

type Counts = Awaited<ReturnType<typeof receiptCounts>>;

/** Lo que hay que cuadrar: cuántos, cuánto, del primero al último número, anulados y lo que falta en SUNAT. */
function Summary({ tab, counts }: { tab: ReceiptTab; counts: Counts }) {
  if (tab === "devoluciones") {
    const r = counts.returns;
    return (
      <Card>
        <div className="flex flex-wrap gap-x-10 gap-y-3 text-sm">
          <Stat label="Devoluciones" value={String(r.count)} />
          <Stat label="Devuelto" value={r.cents ? `−${formatPrice(r.cents)}` : formatPrice(0)} />
          <Stat label="Con nota de crédito" value={String(r.creditNotes)} />
          {r.pending ? <Stat label="Sin aceptar en SUNAT" value={String(r.pending)} warn /> : null}
        </div>
      </Card>
    );
  }
  const types = tab === "todos" ? (["nota_venta", "boleta", "factura"] as const) : ([tab] as const);
  return (
    <Card>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {types.map((t) => {
          const c = counts[t];
          return (
            <div key={t} className="space-y-1 text-sm">
              <p className="font-semibold">{TAB_LABEL[t]}</p>
              <p className="text-2xl font-extrabold tabular-nums">{formatPrice(c.cents)}</p>
              <p className="text-muted">
                {c.count} {c.count === 1 ? "pagada" : "pagadas"}
                {c.voided ? ` · ${c.voided} ${c.voided === 1 ? "anulada" : "anuladas"}` : ""}
                {c.first !== null && c.last !== null ? ` · N° ${c.first} al ${c.last}` : ""}
              </p>
              {c.pending || c.rejected ? (
                <p className="text-warning">
                  {c.pending ? `${c.pending} sin respuesta de SUNAT` : ""}
                  {c.pending && c.rejected ? " · " : ""}
                  {c.rejected ? `${c.rejected} rechazadas` : ""}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div>
      <p className="text-muted">{label}</p>
      <p className={cn("text-2xl font-extrabold tabular-nums", warn && "text-warning")}>{value}</p>
    </div>
  );
}

function SalesTable({ rows }: { rows: ReceiptSale[] }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-line">
      <table className="w-full min-w-[56rem] text-sm">
        <thead className="bg-surface text-left text-xs text-muted">
          <tr>
            <th className="px-3 py-2.5 font-normal">#</th>
            <th className="px-3 py-2.5 font-normal">Emisión</th>
            <th className="px-3 py-2.5 font-normal">Cliente</th>
            <th className="px-3 py-2.5 font-normal">Número</th>
            <th className="px-3 py-2.5 font-normal">SUNAT</th>
            <th className="px-3 py-2.5 font-normal">Pago</th>
            <th className="px-3 py-2.5 font-normal">Vendedor</th>
            <th className="px-3 py-2.5 text-right font-normal">Total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((s, i) => {
            const sunat = s.sunatStatus ? SUNAT_BADGE[s.sunatStatus] : null;
            return (
              <tr key={s.id} className={cn("align-top hover:bg-surface", s.status === "anulada" && "opacity-60")}>
                <td className="px-3 py-3 text-xs text-subtle tabular-nums">{i + 1}</td>
                <td className="px-3 py-3 whitespace-nowrap">{formatDateTime(s.createdAt)}</td>
                <td className="px-3 py-3">
                  {s.customerName ?? "Clientes varios"}
                  {s.customerDocumentNumber ? (
                    <span className="block text-xs text-subtle">
                      {s.customerDocumentType ? DOCUMENT_LABEL[s.customerDocumentType] : "Doc."} {s.customerDocumentNumber}
                    </span>
                  ) : null}
                </td>
                <td className="px-3 py-3">
                  <Link href={`/admin/ventas-tienda/${s.id}`} className="font-mono font-semibold underline-offset-4 hover:underline">
                    {formatDocNumber(s.series, s.number)}
                  </Link>
                  <span className="block text-xs text-subtle">
                    {POS_DOCUMENT_LABEL[s.documentType]} · Caja #{s.sessionNumber}
                  </span>
                  {s.channel === "virtual" ? <Badge tone="info">Virtual</Badge> : null}
                </td>
                <td className="px-3 py-3">
                  {sunat ? <Badge tone={sunat.tone}>{sunat.label}</Badge> : <span className="text-xs text-subtle">No va a SUNAT</span>}
                  {s.sunatVoidStatus ? <span className="mt-1 block text-xs text-muted">Baja: {s.sunatVoidStatus.toLowerCase()}</span> : null}
                </td>
                <td className="px-3 py-3 text-xs text-muted">{methodsLabel(s.methods)}</td>
                <td className="px-3 py-3 text-xs text-muted">{s.sellerName ?? "—"}</td>
                <td className="px-3 py-3 text-right whitespace-nowrap">
                  {s.status === "anulada" ? <Badge tone="danger">Anulada</Badge> : <span className="font-semibold tabular-nums">{formatPrice(s.totalCents)}</span>}
                  <span className="block text-xs text-subtle">
                    {s.units} {s.units === 1 ? "prenda" : "prendas"}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ReturnsTable({ rows }: { rows: Awaited<ReturnType<typeof listReceiptReturns>> }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-line">
      <table className="w-full min-w-[52rem] text-sm">
        <thead className="bg-surface text-left text-xs text-muted">
          <tr>
            <th className="px-3 py-2.5 font-normal">Fecha</th>
            <th className="px-3 py-2.5 font-normal">Documento</th>
            <th className="px-3 py-2.5 font-normal">Modifica a</th>
            <th className="px-3 py-2.5 font-normal">Cliente</th>
            <th className="px-3 py-2.5 font-normal">SUNAT</th>
            <th className="px-3 py-2.5 font-normal">Motivo</th>
            <th className="px-3 py-2.5 text-right font-normal">Devuelto</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r) => {
            const sunat = r.sunatStatus ? SUNAT_BADGE[r.sunatStatus] : null;
            return (
              <tr key={r.id} className="align-top">
                <td className="px-3 py-3 whitespace-nowrap">{formatDateTime(r.createdAt)}</td>
                <td className="px-3 py-3 font-mono font-semibold">{r.creditNoteSeries ? formatDocNumber(r.creditNoteSeries, r.creditNoteNumber!) : `DEV-${r.number}`}</td>
                <td className="px-3 py-3">
                  <Link href={`/admin/ventas-tienda/${r.saleId}`} className="font-mono underline-offset-4 hover:underline">
                    {formatDocNumber(r.saleSeries, r.saleNumber)}
                  </Link>
                </td>
                <td className="px-3 py-3">{r.customerName ?? "Clientes varios"}</td>
                <td className="px-3 py-3">{sunat ? <Badge tone={sunat.tone}>{sunat.label}</Badge> : <span className="text-xs text-subtle">—</span>}</td>
                <td className="px-3 py-3 text-xs text-muted">
                  {r.reason}
                  <span className="block">
                    {PAYMENT_LABEL[r.refundMethod]} · Caja #{r.sessionNumber}
                  </span>
                </td>
                <td className="px-3 py-3 text-right font-semibold whitespace-nowrap tabular-nums">−{formatPrice(r.refundCents)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
