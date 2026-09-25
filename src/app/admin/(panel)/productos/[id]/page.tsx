import { CheckCircle2, ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AdminPage, Badge, buttonClass, Card } from "@/components/admin/ui";
import { getDb } from "@/server/db/client";
import { getAdminProduct, getCatalogOptions, listOutfitCandidates } from "@/server/services/admin-products";
import { requireAdmin } from "../../../_lib/auth";
import { DeleteProductButton } from "../delete-product-button";
import { OutfitEditor } from "../outfit-editor";
import { PhotoManager } from "../photo-manager";
import { ProductForm } from "../product-form";
import { VariantsEditor } from "../variants-editor";

export const instant = false;
export const metadata: Metadata = { title: "Editar producto" };

const UUID = /^[0-9a-f-]{36}$/i;

export default async function EditProductPage({ params, searchParams }: PageProps<"/admin/productos/[id]">) {
  await requireAdmin();
  const { id } = await params;
  const isNew = (await searchParams).nuevo === "1";
  if (!UUID.test(id)) notFound();
  const db = getDb();
  const [data, options] = await Promise.all([getAdminProduct(db, id), getCatalogOptions(db)]);
  if (!data) notFound();
  const { product, variants, images, pieces } = data;
  const outfit = product.kind === "outfit";
  const candidates = outfit ? (await listOutfitCandidates(db)).filter((c) => c.id !== product.id) : [];

  const variantColors = [...new Map(variants.map((v) => [v.colorId, { id: v.colorId, name: v.colorName }])).values()];
  const activeVariants = variants.filter((v) => v.isActive).length;
  const missing = (
    outfit
      ? [pieces.length < 2 && "prendas", !product.outfitPriceCents && "precio", images.length === 0 && "fotos"]
      : [activeVariants === 0 && "variantes activas", images.length === 0 && "fotos"]
  ).filter(Boolean);
  const piecesProblem = pieces.find((p) => p.status === "archived" || p.totalStock === 0);

  return (
    <AdminPage
      back={{ href: "/admin/productos", label: "Productos" }}
      title={product.name}
      description={
        <span className="flex flex-wrap items-center gap-2">
          <Badge tone={product.status === "active" ? "success" : "neutral"}>
            {product.status === "active" ? "Publicado" : product.status === "draft" ? "Borrador" : "Archivado"}
          </Badge>
          {outfit ? <Badge>Conjunto</Badge> : null}
          {missing.length ? <span className="text-warning">Falta: {missing.join(", ").replace(/, ([^,]*)$/, " y $1")}</span> : null}
          {!missing.length && piecesProblem ? (
            <span className="text-warning">
              {piecesProblem.status === "archived" ? `“${piecesProblem.name}” está archivada: el conjunto no se vende.` : `“${piecesProblem.name}” no tiene stock: el conjunto sale agotado.`}
            </span>
          ) : null}
        </span>
      }
      actions={
        product.status === "active" ? (
          <a href={`/product/${product.slug}`} target="_blank" rel="noopener noreferrer" className={buttonClass("secondary")}>
            <ExternalLink className="size-4" aria-hidden /> Ver en la tienda
          </a>
        ) : null
      }
    >
      {isNew ? (
        <p className="mb-4 flex items-center gap-2 rounded-xl bg-success/15 px-4 py-3 text-sm text-success">
          <CheckCircle2 className="size-4" aria-hidden />{" "}
          {outfit ? "Conjunto creado. Ahora elige sus prendas y el precio, y sube sus fotos." : "Producto creado. Ahora agrega sus variantes (color y talla) y sus fotos."}
        </p>
      ) : null}

      <nav aria-label="Secciones" className="no-scrollbar sticky top-14 z-20 -mx-4 mb-4 flex gap-2 overflow-x-auto border-b border-line bg-ink/90 px-4 py-2 backdrop-blur-md lg:top-0">
        {[
          ["#datos", "Datos"],
          outfit ? ["#prendas", `Prendas y precio (${pieces.length})`] : ["#variantes", `Variantes (${variants.length})`],
          ["#fotos", `Fotos (${images.length})`],
        ].map(([href, label]) => (
          <a key={href} href={href} className="inline-flex h-9 shrink-0 items-center rounded-full border border-line px-4 text-sm">
            {label}
          </a>
        ))}
      </nav>

      <div className="space-y-4">
        <div id="datos" className="scroll-mt-32">
          <Card title={outfit ? "Datos del conjunto" : "Datos del producto"}>
            <ProductForm
              productId={product.id}
              kind={product.kind}
              categories={options.categories}
              fits={options.fits}
              initial={{
                name: product.name,
                slug: product.slug,
                categoryId: product.categoryId,
                fitId: product.fitId,
                description: product.description,
                sizeGuide: product.sizeGuide,
                status: product.status,
                isFeatured: product.isFeatured,
                metaTitle: product.metaTitle,
                metaDescription: product.metaDescription,
              }}
            />
          </Card>
        </div>

        {outfit ? (
          <div id="prendas" className="scroll-mt-32">
            <Card title="Prendas y precio del conjunto">
              <OutfitEditor
                productId={product.id}
                candidates={candidates}
                initial={{ priceCents: product.outfitPriceCents, pieces: pieces.map((p) => ({ productId: p.productId, label: p.label ?? "" })) }}
              />
            </Card>
          </div>
        ) : (
          <div id="variantes" className="scroll-mt-32">
            <Card title="Variantes: color, talla, precio y stock">
              <VariantsEditor
                productId={product.id}
                colorNames={options.colors.map((c) => c.name)}
                sizeLabels={options.sizes.map((s) => s.label)}
                initial={variants.map((v) => ({
                  id: v.id,
                  color: v.colorName,
                  size: v.sizeLabel,
                  sku: v.sku,
                  priceCents: v.priceCents,
                  compareAtPriceCents: v.compareAtPriceCents,
                  stock: v.stock,
                  isActive: v.isActive,
                }))}
              />
            </Card>
          </div>
        )}

        <div id="fotos" className="scroll-mt-32">
          <Card title="Fotos">
            {outfit ? (
              <PhotoManager productId={product.id} colors={[]} outfit photos={images.map((i) => ({ id: i.id, path: i.path, colorId: i.colorId }))} />
            ) : variantColors.length === 0 && images.length === 0 ? (
              <p className="text-sm text-muted">Primero guarda al menos una variante: las fotos se ordenan por color.</p>
            ) : (
              <PhotoManager productId={product.id} colors={variantColors} photos={images.map((i) => ({ id: i.id, path: i.path, colorId: i.colorId }))} />
            )}
          </Card>
        </div>

        <Card title="Eliminar">
          <p className="mb-3 text-sm text-muted">Si el producto ya tiene ventas, se archiva en lugar de borrarse (los pedidos lo necesitan).</p>
          <DeleteProductButton productId={product.id} />
        </Card>
      </div>
    </AdminPage>
  );
}
