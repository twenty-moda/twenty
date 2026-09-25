import { Layers, Plus } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { AdminPage, Badge, buttonClass, EmptyState, FilterTabs, SearchBox } from "@/components/admin/ui";
import { formatPrice } from "@/lib/money";
import { getDb } from "@/server/db/client";
import { getCatalogOptions, listAdminProducts, type AdminProductFilter } from "@/server/services/admin-products";
import { requireAdmin } from "../../_lib/auth";

export const instant = false;
export const metadata: Metadata = { title: "Productos" };

const STATUS = { active: { label: "Publicado", tone: "success" }, draft: { label: "Borrador", tone: "neutral" }, archived: { label: "Archivado", tone: "neutral" } } as const;

export default async function ProductsPage({ searchParams }: PageProps<"/admin/productos">) {
  await requireAdmin();
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q : undefined;
  const category = typeof params.categoria === "string" ? params.categoria : undefined;
  const vista = typeof params.vista === "string" ? params.vista : undefined;
  const filter: AdminProductFilter = {
    q,
    category,
    status: vista === "publicados" ? "active" : vista === "borradores" ? "draft" : vista === "archivados" ? "archived" : undefined,
    problem: vista === "sin-fotos" || vista === "sin-stock" ? vista : undefined,
  };
  const db = getDb();
  const [rows, options] = await Promise.all([listAdminProducts(db, filter), getCatalogOptions(db)]);

  const href = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams();
    for (const [k, v] of Object.entries({ q, categoria: category, vista, ...patch })) if (v) next.set(k, v);
    const s = next.toString();
    return `/admin/productos${s ? `?${s}` : ""}`;
  };
  const views = [
    { key: undefined, label: "Todos" },
    { key: "publicados", label: "Publicados" },
    { key: "borradores", label: "Borradores" },
    { key: "sin-fotos", label: "Sin fotos" },
    { key: "sin-stock", label: "Sin stock" },
    { key: "archivados", label: "Archivados" },
  ];

  return (
    <AdminPage
      title="Productos"
      description="Toca un producto para editar sus datos, variantes y fotos. Los conjuntos venden varias prendas juntas con el stock de cada una."
      actions={
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/productos/nuevo?tipo=conjunto" className={buttonClass("secondary")}>
            <Layers className="size-4" aria-hidden /> Nuevo conjunto
          </Link>
          <Link href="/admin/productos/nuevo" className={buttonClass("primary")}>
            <Plus className="size-4" aria-hidden /> Nuevo producto
          </Link>
        </div>
      }
    >
      <div className="space-y-4">
        <SearchBox placeholder="Buscar por nombre o SKU" defaultValue={q} hidden={{ categoria: category, vista }} />
        <FilterTabs items={views.map((v) => ({ href: href({ vista: v.key }), label: v.label, active: vista === v.key }))} />
        <FilterTabs
          items={[
            { href: href({ categoria: undefined }), label: "Todas las categorías", active: !category },
            ...options.categories.map((c) => ({ href: href({ categoria: c.slug }), label: c.name, active: category === c.slug })),
          ]}
        />
      </div>

      <div className="mt-5">
        {rows.length === 0 ? (
          <EmptyState title="No hay productos con ese filtro">
            <Link href="/admin/productos" className="underline">
              Ver todos
            </Link>
          </EmptyState>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line">
            {rows.map((p) => (
              <li key={p.id}>
                <Link href={`/admin/productos/${p.id}`} className="flex items-center gap-3 px-3 py-3 hover:bg-surface sm:px-4">
                  <span className="relative aspect-3/4 w-12 shrink-0 overflow-hidden rounded-md bg-raised">
                    {p.image ? <Image src={p.image} alt="" fill sizes="48px" className="object-cover" /> : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{p.name}</span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
                      <span>{p.categoryName}</span>
                      <span>·</span>
                      {p.kind === "outfit" ? (
                        <span>Conjunto de {p.pieces} prendas</span>
                      ) : (
                        <span>
                          {p.variants} {p.variants === 1 ? "variante" : "variantes"}
                        </span>
                      )}
                      {p.images === 0 ? <span className="text-warning">· Sin fotos</span> : null}
                    </span>
                  </span>
                  {p.kind === "outfit" ? (
                    <span className="hidden text-right text-sm sm:block">
                      <span className="block font-semibold">{p.outfitPriceCents ? formatPrice(p.outfitPriceCents) : "Sin precio"}</span>
                      <span className="block text-xs text-muted">Stock de sus prendas</span>
                    </span>
                  ) : (
                    <span className="hidden text-right text-sm sm:block">
                      <span className="block font-semibold">
                        {p.minPrice === null ? "—" : p.minPrice === p.maxPrice ? formatPrice(p.minPrice) : `${formatPrice(p.minPrice)} – ${formatPrice(p.maxPrice!)}`}
                      </span>
                      <span className={p.totalStock === 0 ? "block text-xs text-danger" : "block text-xs text-muted"}>
                        {p.totalStock === 0 ? "Sin stock" : `${p.totalStock} en stock`}
                      </span>
                    </span>
                  )}
                  <Badge tone={STATUS[p.status].tone}>{STATUS[p.status].label}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AdminPage>
  );
}
