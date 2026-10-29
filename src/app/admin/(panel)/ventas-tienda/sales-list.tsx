import Link from "next/link";
import { Badge, formatDateTime } from "@/components/admin/ui";
import { cn } from "@/lib/cn";
import { formatPrice } from "@/lib/money";
import { formatDocNumber, PAYMENT_LABEL, type PaymentMethod } from "@/lib/pos";
import type { listPosSales } from "@/server/services/pos";

type Row = Awaited<ReturnType<typeof listPosSales>>["rows"][number];

/** Ventas en tienda: número, cliente, medios de pago y total. Toca una para ver el ticket o anularla. */
export function SalesList({ rows }: { rows: Row[] }) {
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line">
      {rows.map((s) => (
        <li key={s.id}>
          <Link href={`/admin/ventas-tienda/${s.id}`} className={cn("flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm hover:bg-surface", s.status === "anulada" && "opacity-60")}>
            <span className="w-28 font-mono font-semibold">{formatDocNumber(s.series, s.number)}</span>
            <span className="min-w-[10rem] flex-1">
              {s.customerName ?? "Clientes varios"}
              <span className="block text-xs text-subtle">
                {formatDateTime(s.createdAt)} · {s.warehouseCode}
                {s.sellerName ? ` · ${s.sellerName}` : ""}
              </span>
            </span>
            <span className="text-xs text-muted">
              {(s.methods ?? "")
                .split(",")
                .filter(Boolean)
                .map((m) => PAYMENT_LABEL[m as PaymentMethod])
                .join(" + ")}
            </span>
            <span className="w-28 text-right">
              {s.status === "anulada" ? <Badge tone="danger">Anulada</Badge> : <span className="font-semibold tabular-nums">{formatPrice(s.totalCents)}</span>}
              <span className="block text-xs text-subtle">
                {s.units} {s.units === 1 ? "prenda" : "prendas"}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
