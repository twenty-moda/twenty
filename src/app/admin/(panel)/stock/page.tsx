import { ArrowDownToLine, ArrowLeftRight, Barcode } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AdminPage, buttonClass, EmptyState, FilterTabs, SearchBox } from "@/components/admin/ui";
import { ColorSwatch } from "@/components/ui/color-swatch";
import { cn } from "@/lib/cn";
import { formatPrice } from "@/lib/money";
import { slugify } from "@/lib/slug";
import { getDb } from "@/server/db/client";
import { listPickerVariants, listWarehouses, type PickerVariant } from "@/server/services/inventory";
import { requireAdmin } from "../../_lib/auth";

// Filtrado por la URL (almacén, estado, búsqueda): se arma en el servidor en cada visita.
export const instant = false;
export const metadata: Metadata = { title: "Stock por talla" };

const LOW = 2;
type Filter = "bajo" | "agotado";

/**
 * Stock de cada talla y color en cada almacén, como grilla por modelo: de un vistazo se ve qué talla falta. Cada
 * número abre su kardex.
 */
export default async function StockPage({ searchParams }: PageProps<"/admin/stock">) {
  await requireAdmin();
  const params = await searchParams;
  const db = getDb();
  const [warehouses, variants] = await Promise.all([listWarehouses(db), listPickerVariants(db)]);
  const active = warehouses.filter((w) => w.isActive);
  const all = params.almacen === "todos";
  const warehouse = all ? null : (active.find((w) => w.id === params.almacen) ?? active.find((w) => w.sellsOnline) ?? active[0]);
  const filter: Filter | null = params.filtro === "bajo" || params.filtro === "agotado" ? params.filtro : null;
  const q = typeof params.q === "string" ? params.q.trim() : "";
  const href = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams();
    for (const [k, v] of Object.entries({ almacen: all ? "todos" : warehouse?.id, filtro: filter ?? undefined, q: q || undefined, ...patch })) if (v) next.set(k, v);
    return `/admin/stock?${next}`;
  };

  const qty = (v: PickerVariant) => (warehouse ? (v.levels[warehouse.id] ?? 0) : active.reduce((s, w) => s + (v.levels[w.id] ?? 0), 0));
  const term = slugify(q);
  const shown = variants.filter((v) => v.isActive && (!term || slugify(`${v.productName} ${v.colorName} ${v.sku}`).includes(term)));

  // Totales del almacén elegido (con la búsqueda, no con el filtro de estado).
  let units = 0, valueCents = 0, out = 0, low = 0;
  for (const v of shown) {
    const n = qty(v);
    units += n;
    valueCents += n * v.priceCents;
    if (n === 0) out++;
    else if (n <= LOW) low++;
  }

  // Modelo → colores → tallas. Las columnas son las tallas del modelo, en su orden.
  type Model = { productId: string; name: string; priceCents: number; units: number; sizes: Map<string, number>; colors: Map<string, { hex: string | null; cells: Map<string, PickerVariant> }> };
  const models = new Map<string, Model>();
  for (const v of shown) {
    const m = models.get(v.productId) ?? { productId: v.productId, name: v.productName, priceCents: v.priceCents, units: 0, sizes: new Map(), colors: new Map() };
    m.units += qty(v);
    m.sizes.set(v.sizeLabel, v.sizePosition);
    const color = m.colors.get(v.colorName) ?? { hex: v.colorHex, cells: new Map() };
    color.cells.set(v.sizeLabel, v);
    m.colors.set(v.colorName, color);
    models.set(v.productId, m);
  }
  const matches = (n: number) => !filter || (filter === "agotado" ? n === 0 : n > 0 && n <= LOW);
  const rows = [...models.values()]
    .map((m) => ({
      ...m,
      sizeOrder: [...m.sizes].sort((a, b) => a[1] - b[1]).map(([label]) => label),
      colorRows: [...m.colors].filter(([, c]) => [...c.cells.values()].some((v) => matches(qty(v)))),
    }))
    .filter((m) => m.colorRows.length);

  return (
    <AdminPage
      title="Stock por talla"
      description="Cada talla y color en cada almacén. Toca un número para ver su kardex."
      actions={
        <>
          <Link href="/admin/movimientos/nuevo?tipo=ingreso" className={buttonClass("primary")}>
            <ArrowDownToLine className="size-4" aria-hidden /> Ingreso
          </Link>
          <Link href="/admin/movimientos/nuevo?tipo=traslado" className={buttonClass("secondary")}>
            <ArrowLeftRight className="size-4" aria-hidden /> Traslado
          </Link>
          <Link href="/admin/etiquetas" className={buttonClass("secondary")}>
            <Barcode className="size-4" aria-hidden /> Etiquetas
          </Link>
        </>
      }
    >
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Tile label="Prendas" value={units.toLocaleString("es-PE")} />
          <Tile label="A precio de venta" value={formatPrice(valueCents)} />
          <Tile label="Tallas agotadas" value={String(out)} tone="danger" href={href({ filtro: "agotado" })} />
          <Tile label={`Quedan 1 o ${LOW}`} value={String(low)} tone="warning" href={href({ filtro: "bajo" })} />
        </div>

        <div className="space-y-3">
          <SearchBox placeholder="Busca un modelo, color o SKU" defaultValue={q} hidden={{ almacen: all ? "todos" : warehouse?.id, filtro: filter ?? undefined }} />
          <FilterTabs
            items={[
              ...active.map((w) => ({ href: href({ almacen: w.id }), label: w.name, active: w.id === warehouse?.id })),
              ...(active.length > 1 ? [{ href: href({ almacen: "todos" }), label: "Todos los almacenes", active: all }] : []),
            ]}
          />
          <FilterTabs
            items={[
              { href: href({ filtro: undefined }), label: "Todo", active: !filter },
              { href: href({ filtro: "bajo" }), label: `Quedan 1 o ${LOW}`, count: low, active: filter === "bajo" },
              { href: href({ filtro: "agotado" }), label: "Agotadas", count: out, active: filter === "agotado" },
            ]}
          />
          <p className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted">
            <span className="inline-flex items-center gap-2">
              <span className="grid h-6 w-8 place-items-center rounded-md border border-danger font-bold text-danger">0</span> Agotada
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="grid h-6 w-8 place-items-center rounded-md bg-warning font-bold text-black">2</span> Quedan 1 o {LOW}
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="grid h-6 w-8 place-items-center rounded-md bg-raised font-bold">9</span> Con stock
            </span>
          </p>
        </div>

        {rows.length === 0 ? (
          <EmptyState title={filter ? "No hay tallas así" : "No hay prendas"}>{q ? "Prueba con otra búsqueda." : null}</EmptyState>
        ) : (
          rows.map((m) => (
            <section key={m.productId} className="overflow-hidden rounded-2xl border border-line bg-surface">
              <header className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-line px-4 py-3">
                <h2 className="font-bold">
                  <Link href={`/admin/productos/${m.productId}`} className="hover:underline">
                    {m.name}
                  </Link>
                </h2>
                <span className="text-sm text-muted">
                  {formatPrice(m.priceCents)} · {m.units} {m.units === 1 ? "prenda" : "prendas"}
                </span>
              </header>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[32rem] text-sm">
                  <thead>
                    <tr className="font-mono text-[11px] tracking-wider text-subtle uppercase">
                      <th scope="col" className="px-4 py-2 text-left font-semibold">
                        Color
                      </th>
                      {m.sizeOrder.map((s) => (
                        <th key={s} scope="col" className="px-1 py-2 font-semibold">
                          {s}
                        </th>
                      ))}
                      <th scope="col" className="px-4 py-2 text-right font-semibold">
                        Total
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {m.colorRows.map(([colorName, color]) => {
                      const rowTotal = [...color.cells.values()].reduce((s, v) => s + qty(v), 0);
                      return (
                        <tr key={colorName} className="border-t border-line">
                          <th scope="row" className="px-4 py-2 text-left font-medium">
                            <span className="inline-flex items-center gap-2">
                              {color.hex ? <ColorSwatch hex={color.hex} className="size-3" /> : null}
                              {colorName}
                            </span>
                          </th>
                          {m.sizeOrder.map((s) => {
                            const v = color.cells.get(s);
                            if (!v) {
                              return (
                                <td key={s} className="px-1 py-2 text-center text-subtle">
                                  <span className="sr-only">No existe</span>·
                                </td>
                              );
                            }
                            const n = qty(v);
                            return (
                              <td key={s} className="px-1 py-1.5 text-center">
                                <Link
                                  href={`/admin/movimientos?vista=kardex&q=${encodeURIComponent(v.sku)}${warehouse ? `&almacen=${warehouse.id}` : ""}`}
                                  aria-label={`${colorName} talla ${s}: ${n} · ver kardex de ${v.sku}`}
                                  className={cn(
                                    "mx-auto grid h-10 w-12 place-items-center rounded-lg font-bold tabular-nums transition hover:ring-2 hover:ring-white",
                                    n === 0 ? "border border-danger text-danger" : n <= LOW ? "bg-warning text-black" : "bg-raised",
                                    filter && !matches(n) && "opacity-30",
                                  )}
                                >
                                  {n}
                                </Link>
                              </td>
                            );
                          })}
                          <td className="px-4 py-2 text-right font-bold tabular-nums">{rowTotal}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          ))
        )}
      </div>
    </AdminPage>
  );
}

function Tile({ label, value, tone, href }: { label: string; value: string; tone?: "danger" | "warning"; href?: string }) {
  const body = (
    <div className={cn("h-full rounded-2xl border p-4", tone === "danger" ? "border-danger/50 bg-danger/10" : tone === "warning" ? "border-warning/50 bg-warning/10" : "border-line bg-surface")}>
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-2 text-2xl font-extrabold tracking-tight tabular-nums">{value}</p>
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}
