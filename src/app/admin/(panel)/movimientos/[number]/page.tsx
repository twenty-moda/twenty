import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminPage, Badge, Card, formatDateTime } from "@/components/admin/ui";
import { cn } from "@/lib/cn";
import { formatUnits, MOVEMENT_LABEL, OPERATION_LABEL } from "@/lib/inventory";
import { formatPrice } from "@/lib/money";
import { getDb } from "@/server/db/client";
import { getOperation } from "@/server/services/inventory";
import { requireAdmin } from "../../../_lib/auth";

export async function generateMetadata({ params }: PageProps<"/admin/movimientos/[number]">): Promise<Metadata> {
  const { number } = await params;
  return { title: `Operación #${number}` };
}

// El admin se arma en el servidor en cada visita (lee la sesión): no se exige navegación instantánea.
export const instant = false;

export default async function OperationPage({ params }: PageProps<"/admin/movimientos/[number]">) {
  await requireAdmin();
  const { number } = await params;
  const n = Number(number);
  if (!Number.isInteger(n)) notFound();
  const operation = await getOperation(getDb(), n);
  if (!operation) notFound();

  // En un traslado cada prenda tiene dos filas (sale y entra): se cuenta una vez.
  const moved = operation.lines.filter((l) => (operation.kind === "salida" ? l.quantity < 0 : l.quantity > 0));
  const units = moved.reduce((s, l) => s + Math.abs(l.quantity), 0);
  const cost = moved.reduce((s, l) => s + (l.unitCostCents ?? 0) * Math.abs(l.quantity), 0);

  return (
    <AdminPage
      title={`${OPERATION_LABEL[operation.kind]} #${operation.number}`}
      back={{ href: "/admin/movimientos", label: "Movimientos" }}
      description={[
        operation.kind === "traslado" ? `${operation.fromName} → ${operation.toName}` : (operation.toName ?? operation.fromName),
        formatDateTime(operation.createdAt),
        operation.userName,
      ]
        .filter(Boolean)
        .join(" · ")}
    >
      <div className="space-y-4">
        <Card>
          <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-muted">Unidades</dt>
              <dd className="text-lg font-semibold tabular-nums">{formatUnits(units)}</dd>
            </div>
            <div>
              <dt className="text-muted">Prendas distintas</dt>
              <dd className="text-lg font-semibold tabular-nums">{new Set(moved.map((l) => l.sku)).size}</dd>
            </div>
            {operation.kind === "ingreso" ? (
              <div>
                <dt className="text-muted">Costo total</dt>
                <dd className="text-lg font-semibold tabular-nums">{cost ? formatPrice(cost) : "—"}</dd>
              </div>
            ) : null}
          </dl>
          {operation.note ? <p className="mt-4 border-t border-line pt-4 text-sm whitespace-pre-line">{operation.note}</p> : null}
        </Card>

        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line">
          {operation.lines.map((l) => (
            <li key={l.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm">
              <span className="min-w-[12rem] flex-1">
                <Link href={`/admin/productos/${l.productId}`} className="font-medium hover:underline">
                  {l.productName}
                </Link>{" "}
                · {l.colorName} · Talla {l.sizeLabel}
                <span className="block font-mono text-xs text-subtle">{l.sku}</span>
              </span>
              <span className="flex min-w-[11rem] flex-wrap items-center gap-2">
                <Badge tone={l.quantity > 0 ? "success" : "neutral"}>{MOVEMENT_LABEL[l.type]}</Badge>
                <span className="text-xs text-muted">{l.warehouseName}</span>
              </span>
              <span className="w-28 text-right tabular-nums">
                <span className={cn("font-semibold", l.quantity > 0 ? "text-success" : "text-white")}>{l.quantity > 0 ? `+${l.quantity}` : l.quantity}</span>
                <span className="block text-xs text-muted">
                  Saldo {l.balanceAfter}
                  {l.unitCostCents ? ` · ${formatPrice(l.unitCostCents)} c/u` : ""}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </AdminPage>
  );
}
