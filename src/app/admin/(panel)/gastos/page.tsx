import { ChevronLeft, ChevronRight, FileSpreadsheet, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AdminPage, Badge, buttonClass, Card, EmptyState, SearchBox } from "@/components/admin/ui";
import { cn } from "@/lib/cn";
import { EXPENSE_CATEGORIES, expenseCategoryLabel, expenseDocumentLabel, expenseMonth, monthLabel, shiftMonth } from "@/lib/expenses";
import { formatPrice } from "@/lib/money";
import { PAYMENT_LABEL } from "@/lib/pos";
import { getDb } from "@/server/db/client";
import { listExpenses } from "@/server/services/expenses";
import { requireStaff } from "../../_lib/auth";
import { VoidExpenseButton } from "../caja/cash-forms";

export const instant = false;
export const metadata: Metadata = { title: "Gastos" };

const day = (iso: string) => iso.split("-").reverse().join("/");

/** Listado de gastos por mes (como el de Insaga): buscar, filtrar por motivo, exportar a Excel y anular. */
export default async function ExpensesPage({ searchParams }: PageProps<"/admin/gastos">) {
  const user = await requireStaff();
  const admin = user.role === "admin";
  const params = await searchParams;
  const { month, from, to } = expenseMonth(params.mes);
  const q = typeof params.q === "string" ? params.q : undefined;
  const category = typeof params.motivo === "string" && params.motivo in EXPENSE_CATEGORIES ? params.motivo : undefined;
  const result = await listExpenses(getDb(), { from, to, q, category, userId: admin ? undefined : user.id });
  const query = (over: Record<string, string | undefined>) => {
    const next = new URLSearchParams(Object.entries({ mes: month, q, motivo: category, ...over }).filter((e): e is [string, string] => !!e[1]));
    return `?${next}`;
  };
  const created = typeof params.nuevo === "string" ? params.nuevo : null;

  return (
    <AdminPage
      title="Gastos"
      description={admin ? "Lo que se pagó en la tienda. Los que salieron del efectivo de una caja también están en su reporte de cierre." : "Los gastos que anotaste. Los que salieron de tu caja también están en su reporte de cierre."}
      actions={
        <>
          <a href={`/admin/gastos/gastos.xlsx${query({})}`} className={buttonClass("secondary")}>
            <FileSpreadsheet className="size-4" aria-hidden /> Exportar Excel
          </a>
          <Link href="/admin/gastos/nuevo" className={buttonClass("primary")}>
            <Plus className="size-4" aria-hidden /> Nuevo gasto
          </Link>
        </>
      }
    >
      <div className="space-y-4">
        {created ? <p className="rounded-xl bg-success/15 px-4 py-3 text-sm text-success">Gasto #{created} guardado.</p> : null}
        <div className="flex flex-wrap items-center gap-3">
          <nav aria-label="Mes" className="flex items-center gap-1 rounded-full border border-line p-1">
            <Link href={query({ mes: shiftMonth(month, -1) })} aria-label="Mes anterior" className="grid size-9 place-items-center rounded-full hover:bg-raised">
              <ChevronLeft className="size-4" aria-hidden />
            </Link>
            <span className="inline-block min-w-40 text-center text-sm font-semibold first-letter:uppercase">{monthLabel(month)}</span>
            <Link href={query({ mes: shiftMonth(month, 1) })} aria-label="Mes siguiente" className="grid size-9 place-items-center rounded-full hover:bg-raised">
              <ChevronRight className="size-4" aria-hidden />
            </Link>
          </nav>
          <SearchBox placeholder="Buscar detalle, proveedor o N°" defaultValue={q} hidden={{ mes: month, motivo: category }} />
        </div>

        <Card>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-sm text-muted">
                {result.count} {result.count === 1 ? "gasto" : "gastos"} en {monthLabel(month)}
              </p>
              <p className="text-3xl font-extrabold tabular-nums">{formatPrice(result.totalCents)}</p>
            </div>
            {result.byCategory.length ? (
              <div className="flex flex-wrap gap-2">
                {result.byCategory.map((c) => (
                  <Link
                    key={c.category}
                    href={query({ motivo: category === c.category ? undefined : c.category })}
                    aria-current={category === c.category ? "true" : undefined}
                    className={cn("rounded-full border px-3 py-1.5 text-xs", category === c.category ? "border-white bg-white text-black" : "border-line hover:border-white/50")}
                  >
                    {expenseCategoryLabel(c.category)} · <span className="font-semibold tabular-nums">{formatPrice(c.cents)}</span>
                  </Link>
                ))}
              </div>
            ) : null}
          </div>
        </Card>

        {result.rows.length === 0 ? (
          <EmptyState title={q || category ? "Sin gastos con ese filtro" : `Sin gastos en ${monthLabel(month)}`} />
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-line">
            <table className="w-full min-w-[56rem] text-sm">
              <thead className="bg-surface text-left text-xs text-muted">
                <tr>
                  <th className="px-3 py-2.5 font-normal">#</th>
                  <th className="px-3 py-2.5 font-normal">Fecha</th>
                  <th className="px-3 py-2.5 font-normal">Proveedor</th>
                  <th className="px-3 py-2.5 font-normal">Detalle</th>
                  <th className="px-3 py-2.5 font-normal">Motivo</th>
                  <th className="px-3 py-2.5 font-normal">Pago</th>
                  <th className="px-3 py-2.5 text-right font-normal">Total</th>
                  <th className="px-3 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {result.rows.map((r) => {
                  // Una caja cerrada ya hizo su arqueo: su gasto no se anula.
                  const voidable = !r.voidedAt && !r.cashSessionClosedAt && (admin || r.userId === user.id);
                  return (
                    <tr key={r.id} className={cn("align-top", r.voidedAt && "opacity-55")}>
                      <td className="px-3 py-3 font-mono text-xs text-muted">{r.number}</td>
                      <td className="px-3 py-3 whitespace-nowrap tabular-nums">{day(r.issuedOn)}</td>
                      <td className="px-3 py-3">
                        {r.supplierName ?? <span className="text-subtle">—</span>}
                        {r.supplierDocument ? <span className="block text-xs text-subtle">{r.supplierDocument}</span> : null}
                      </td>
                      <td className="px-3 py-3">
                        <span className={cn("font-medium uppercase", r.voidedAt && "line-through")}>{r.description}</span>
                        <span className="block text-xs text-subtle">
                          {expenseDocumentLabel(r.documentType)}
                          {r.documentNumber ? ` ${r.documentNumber}` : ""}
                          {r.userName ? ` · ${r.userName}` : ""}
                        </span>
                        {r.voidedAt ? <span className="block text-xs text-danger">Anulado: {r.voidReason}</span> : null}
                      </td>
                      <td className="px-3 py-3">{expenseCategoryLabel(r.category)}</td>
                      <td className="px-3 py-3">
                        {PAYMENT_LABEL[r.paymentMethod]}
                        {r.cashSessionNumber ? (
                          <Link href={`/admin/caja/${r.cashSessionNumber}`} className="block text-xs text-muted underline hover:text-white">
                            Caja #{r.cashSessionNumber}
                          </Link>
                        ) : null}
                      </td>
                      <td className="px-3 py-3 text-right font-semibold whitespace-nowrap tabular-nums">
                        {r.voidedAt ? <Badge tone="danger">Anulado</Badge> : formatPrice(r.amountCents)}
                      </td>
                      <td className="px-3 py-3 text-right">{voidable ? <VoidExpenseButton expenseId={r.id} /> : null}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminPage>
  );
}
