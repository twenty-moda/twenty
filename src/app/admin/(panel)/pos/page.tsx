import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { displayFont, monoFont } from "@/components/home/fonts";
import { AdminPage, EmptyState } from "@/components/admin/ui";
import { Logo } from "@/components/store/logo";
import { cn } from "@/lib/cn";
import { formatPrice } from "@/lib/money";
import { getDb } from "@/server/db/client";
import { getSiteSettings } from "@/server/services/content";
import { listWarehouses } from "@/server/services/inventory";
import { expectedCash, getOpenSession, getSessionTotals, listPosVariants } from "@/server/services/pos";
import { requireStaff } from "../../_lib/auth";
import { OpenCashForm } from "./open-cash-form";
import { PosScreen } from "./pos-screen";

// El admin se arma en el servidor en cada visita (lee la sesión): no se exige navegación instantánea.
export const instant = false;
export const metadata: Metadata = { title: "Punto de venta" };

/**
 * Modo caja: pantalla completa, sin el menú del panel (lo esconde `AdminShell` en /admin/pos). Arriba, la tienda, el
 * estado de la caja con el efectivo que debería haber, quién vende y la salida al panel.
 */
export default async function PosPage({ searchParams }: PageProps<"/admin/pos">) {
  const user = await requireStaff();
  const { tienda } = await searchParams;
  const db = getDb();
  const warehouses = (await listWarehouses(db)).filter((w) => w.isActive);
  // Por defecto, la tienda que vende en la web (Gamarra).
  const warehouse = warehouses.find((w) => w.id === tienda) ?? warehouses.find((w) => w.sellsOnline) ?? warehouses[0];
  if (!warehouse) return <AdminPage title="Punto de venta"><EmptyState title="No hay tiendas activas" /></AdminPage>;
  const session = await getOpenSession(db, warehouse.id);
  const home = user.role === "admin" ? "/admin" : "/admin/ventas-tienda";

  const bar = (status: ReactNode) => (
    <header className="sticky top-0 z-30 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-surface px-4 py-3 lg:px-6">
      <Link href={home} aria-label="Volver al panel">
        <Logo className="w-24" />
      </Link>
      <span className="font-mono text-xs tracking-widest text-muted uppercase">Modo caja</span>
      {warehouses.length > 1 ? (
        <nav aria-label="Tienda" className="flex flex-wrap gap-1.5">
          {warehouses.map((w) => (
            <Link
              key={w.id}
              href={`/admin/pos?tienda=${w.id}`}
              aria-current={w.id === warehouse.id ? "page" : undefined}
              className={cn("inline-flex h-10 items-center rounded-full border px-4 text-sm font-semibold", w.id === warehouse.id ? "border-white bg-white text-black" : "border-line text-muted hover:text-white")}
            >
              {w.name}
            </Link>
          ))}
        </nav>
      ) : (
        <span className="text-sm font-semibold">{warehouse.name}</span>
      )}
      {status}
      <span className="flex-1" />
      <span className="text-sm text-muted">
        Vende: <strong className="font-semibold text-white">{user.name.split(" ")[0]}</strong>
      </span>
      <Link href="/admin/caja" className="inline-flex h-10 items-center rounded-full border border-line px-4 text-sm font-semibold hover:border-white">
        Ver caja
      </Link>
      <Link href={home} className="inline-flex h-10 items-center rounded-full px-3 text-sm text-muted hover:text-white">
        Salir del modo caja
      </Link>
    </header>
  );

  if (!session) {
    return (
      <>
        {bar(<span className="inline-flex h-10 items-center rounded-full bg-raised px-4 text-sm font-semibold text-muted">Caja cerrada</span>)}
        <div className="mx-auto max-w-lg px-4 py-12">
          <OpenCashForm warehouseId={warehouse.id} warehouseName={warehouse.name} />
        </div>
      </>
    );
  }

  const [variants, settings, totals] = await Promise.all([listPosVariants(db, warehouse.id), getSiteSettings(db), getSessionTotals(db, session.id)]);
  return (
    <>
      {bar(
        <span className="inline-flex h-10 items-center gap-2 rounded-full bg-success/15 px-4 text-sm font-semibold text-success">
          <span className="size-2 rounded-full bg-success" aria-hidden />
          Caja #{session.number} abierta · {formatPrice(expectedCash(session.openingCents, totals))} en efectivo
        </span>,
      )}
      <div className="mx-auto max-w-[90rem] px-4 py-6 lg:px-6">
        <PosScreen
          warehouse={{ id: warehouse.id, name: warehouse.name }}
          variants={variants}
          company={{ legalName: settings.company.legalName, ruc: settings.company.ruc }}
          fontClass={`${displayFont.variable} ${monoFont.variable}`}
        />
      </div>
    </>
  );
}
