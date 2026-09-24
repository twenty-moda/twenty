import { ChevronRight, PackageSearch, ShoppingBag } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { cn } from "@/lib/cn";
import { formatPrice } from "@/lib/money";
import { formatOrderNumber, STATUS_INFO } from "@/lib/order-status";
import { getDb } from "@/server/db/client";
import { listAccountOrders } from "@/server/services/accounts";
import { requireAccount } from "../_lib/account";

export const metadata: Metadata = { title: "Mis pedidos", robots: { index: false } };

const dateFormat = new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", day: "numeric", month: "short", year: "numeric" });
const TONE = { neutral: "bg-subtle", warning: "bg-warning", info: "bg-white", success: "bg-success", danger: "bg-danger" } as const;

export default function AccountOrdersPage() {
  return (
    <Suspense fallback={<OrdersSkeleton />}>
      <Orders />
    </Suspense>
  );
}

async function Orders() {
  const user = await requireAccount("/cuenta");
  const orders = await listAccountOrders(getDb(), user.email);

  if (!orders.length) {
    return (
      <div className="rounded-2xl border border-line p-8 text-center">
        <ShoppingBag className="mx-auto size-10 text-muted" aria-hidden />
        <h2 className="mt-4 text-lg font-bold">Aún no tienes pedidos</h2>
        <p className="mt-1 text-sm text-muted">Aquí verás las compras que hagas con {user.email}.</p>
        <Link href="/catalogo" className="mt-6 inline-flex h-12 items-center rounded-full bg-white px-8 text-sm font-bold tracking-wide text-black uppercase">
          Ver catálogo
        </Link>
        <p className="mt-6 text-sm text-muted">
          ¿Compraste con otro email?{" "}
          <Link href="/tracking" className="font-semibold text-white underline underline-offset-4">
            Rastrea tu pedido con su número
          </Link>
        </p>
      </div>
    );
  }

  return (
    <section aria-labelledby="mis-pedidos">
      <h2 id="mis-pedidos" className="sr-only">
        Mis pedidos
      </h2>
      <ul className="space-y-3">
        {orders.map((order) => {
          const status = STATUS_INFO[order.status];
          return (
            <li key={order.id}>
              <Link href={`/pedido/${order.id}`} className="flex items-center gap-3 rounded-2xl border border-line p-3 transition hover:border-white/40 md:p-4">
                <span className="relative aspect-3/4 w-14 shrink-0 overflow-hidden rounded-lg bg-raised">
                  {order.image ? <Image src={order.image} alt="" fill sizes="56px" className="object-cover" /> : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-bold">Pedido {formatOrderNumber(order.number)}</span>
                    <span className="text-xs text-subtle">{dateFormat.format(order.createdAt)}</span>
                  </span>
                  <span className="mt-1 flex items-center gap-2 text-sm">
                    <span className={cn("size-2 shrink-0 rounded-full", TONE[status.tone])} aria-hidden />
                    {status.customerLabel}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-muted">
                    {order.units} {order.units === 1 ? "prenda" : "prendas"} · {formatPrice(order.totalCents)} · {order.shippingMethodName}
                  </span>
                </span>
                <ChevronRight className="size-5 shrink-0 text-muted" aria-hidden />
              </Link>
            </li>
          );
        })}
      </ul>
      <p className="mt-6 flex items-center justify-center gap-2 text-center text-sm text-muted">
        <PackageSearch className="size-4 shrink-0" aria-hidden /> Toca un pedido para ver el detalle y su estado.
      </p>
    </section>
  );
}

function OrdersSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Cargando tus pedidos">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-24 animate-pulse rounded-2xl bg-raised" />
      ))}
    </div>
  );
}
