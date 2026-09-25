"use client";

import { MessageCircle, Ruler, Tag } from "lucide-react";
import { useRef, useState, ViewTransition, type ReactNode } from "react";
import { siteUrl, whatsappUrl } from "@/lib/links";
import { formatPrice } from "@/lib/money";
import { useUrlSearch } from "@/lib/use-url-search";
import type { ProductDetail } from "@/server/services/catalog";
import { useCartUI } from "../cart/cart-provider";
import { cartStore } from "../cart/cart-store";
import { Breadcrumbs, type Crumb } from "../store/breadcrumbs";
import { Price, promotionLabel } from "../store/price";
import { productMorphName } from "../store/product-card";
import { ColorSwatches, SizeGrid } from "./option-pickers";
import { ProductGallery } from "./product-gallery";
import { SizeGuideSheet } from "./size-guide-sheet";

type ProductExperienceProps = {
  product: ProductDetail;
  whatsapp: string;
  breadcrumbs: Crumb[];
  /** Acordeones de información (server component) que van en la columna derecha. */
  details: ReactNode;
};

const LOW_STOCK = 2;

export function ProductExperience({ product, whatsapp, breadcrumbs, details }: ProductExperienceProps) {
  const { openCart } = useCartUI();
  const [search, setSearch] = useUrlSearch();
  const [guideOpen, setGuideOpen] = useState(false);
  const [needsSize, setNeedsSize] = useState(false);
  const sizesRef = useRef<HTMLFieldSetElement>(null);

  const stockOf = (colorId: string, sizeId: string) =>
    product.variants.find((v) => v.colorId === colorId && v.sizeId === sizeId);
  const colorHasStock = (colorId: string) => product.variants.some((v) => v.colorId === colorId && v.stock > 0);

  // La selección vive en la URL (?color=negro&talla=30): se puede compartir y sobrevive al recargar.
  const params = new URLSearchParams(search);
  const defaultColor = product.colors.find((c) => colorHasStock(c.id)) ?? product.colors[0];
  const color = product.colors.find((c) => c.slug === params.get("color")) ?? defaultColor;
  const requestedSize = product.sizes.find((s) => s.label === params.get("talla")?.toUpperCase());
  const variant = requestedSize ? stockOf(color.id, requestedSize.id) : undefined;
  const selected = variant && variant.stock > 0 ? variant : undefined;
  const size = selected ? requestedSize : undefined;

  const colorVariants = product.variants.filter((v) => v.colorId === color.id);
  const displayPrice = selected ?? colorVariants.reduce((min, v) => (v.priceCents < min.priceCents ? v : min), colorVariants[0]);
  const productInStock = product.variants.some((v) => v.stock > 0);
  const colorInStock = colorHasStock(color.id);

  const select = (patch: { color?: string; talla?: string | null }) => {
    const next = new URLSearchParams(search);
    if (patch.color) next.set("color", patch.color);
    if (patch.talla === null) next.delete("talla");
    else if (patch.talla) next.set("talla", patch.talla);
    setSearch(next.toString());
  };

  const chooseColor = (colorId: string) => {
    const next = product.colors.find((c) => c.id === colorId)!;
    // Se mantiene la talla si existe con stock en el color nuevo.
    const keep = size && (stockOf(colorId, size.id)?.stock ?? 0) > 0;
    select({ color: next.slug, talla: keep ? size.label : null });
  };

  const chooseSize = (label: string) => {
    setNeedsSize(false);
    select({ color: color.slug, talla: label });
  };

  const addToCart = () => {
    if (!selected || !size) {
      setNeedsSize(true);
      const group = sizesRef.current;
      group?.scrollIntoView({ behavior: "smooth", block: "center" });
      group?.classList.remove("animate-shake");
      void group?.offsetWidth; // reinicia la animación
      group?.classList.add("animate-shake");
      return;
    }
    cartStore.add(
      {
        variantId: selected.id,
        productSlug: product.slug,
        productName: product.name,
        colorName: color.name,
        sizeLabel: size.label,
        image: color.images[0]?.path ?? null,
        priceCents: selected.priceCents,
        compareAtPriceCents: selected.compareAtPriceCents,
        stock: selected.stock,
        promotion: product.promotion,
      },
      1,
    );
    openCart(selected.id);
  };

  const ctaLabel = !productInStock
    ? "Agotado"
    : !colorInStock
      ? "Agotado en este color"
      : selected
        ? "Agregar al carrito"
        : "Elige tu talla";
  const ctaDisabled = !productInStock || !colorInStock;

  const helpText = `Hola, tengo una consulta sobre ${product.name} (${color.name}${size ? `, talla ${size.label}` : ""}): ${siteUrl()}/product/${product.slug}`;

  const cta = (
    <button
      type="button"
      onClick={addToCart}
      disabled={ctaDisabled}
      className="h-13 w-full rounded-full bg-white px-3 text-[13px] leading-tight font-bold tracking-wide text-black uppercase transition active:scale-[0.98] disabled:bg-raised disabled:text-subtle min-[360px]:text-sm"
    >
      {ctaLabel}
    </button>
  );

  return (
    // Móvil: foto arriba y datos abajo. Tablet (md): dos columnas iguales. Escritorio (lg): la galería más ancha.
    <div className="mx-auto max-w-7xl pb-28 md:grid md:grid-cols-2 md:gap-8 md:px-6 md:pt-6 md:pb-0 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:gap-10 2xl:max-w-[96rem]">
      {/* Misma "name" que la foto de la tarjeta: al abrir el producto, la foto vuela hasta aquí. */}
      <ViewTransition name={productMorphName(product.slug)} share="morph" default="none">
        <ProductGallery key={color.id} images={color.images} eager />
      </ViewTransition>

      <div className="min-w-0 px-4 pt-5 md:sticky md:top-20 md:self-start md:px-0 md:pt-0">
        <Breadcrumbs items={breadcrumbs} />
        <h1 className="mt-2 text-xl leading-tight font-bold md:text-2xl">{product.name}</h1>
        <Price
          className="mt-2"
          size="lg"
          priceCents={displayPrice.priceCents}
          compareAtPriceCents={displayPrice.compareAtPriceCents}
        />

        {product.promotion ? (
          <p className="mt-4 flex items-center gap-2 rounded-lg bg-white px-3 py-2.5 text-sm text-black">
            <Tag className="size-4 shrink-0" aria-hidden />
            <span>
              <strong className="font-bold">Promo {promotionLabel(product.promotion)}</strong>: combina colores y tallas.
            </span>
          </p>
        ) : null}

        {/* min-w-0: un <fieldset> por defecto no se encoge y la fila de colores desbordaría la página. */}
        <fieldset className="mt-6 min-w-0">
          <legend className="text-sm">
            <span className="text-muted">Color: </span>
            <span className="font-semibold">{color.name}</span>
          </legend>
          <ColorSwatches colors={product.colors} activeId={color.id} inStock={colorHasStock} onChoose={chooseColor} />
        </fieldset>

        <fieldset ref={sizesRef} className="mt-6 min-w-0" aria-describedby={needsSize ? "talla-error" : undefined}>
          <div className="flex items-center justify-between">
            <legend className="text-sm">
              <span className="text-muted">Talla: </span>
              <span className="font-semibold">{size?.label ?? "elige una"}</span>
            </legend>
            {product.sizeGuide ? (
              <button type="button" onClick={() => setGuideOpen(true)} className="-my-2 inline-flex h-10 items-center gap-1.5 text-sm underline underline-offset-4">
                <Ruler className="size-4" aria-hidden /> Guía de tallas
              </button>
            ) : null}
          </div>
          <SizeGrid
            sizes={product.sizes}
            activeId={size?.id}
            stateOf={(sizeId) => {
              const v = stockOf(color.id, sizeId);
              return !v ? "missing" : v.stock > 0 ? "available" : "sold-out";
            }}
            onChoose={chooseSize}
            highlight={needsSize}
          />
          {needsSize ? (
            <p id="talla-error" role="alert" className="mt-2 text-sm text-warning">
              Elige tu talla para agregar al carrito.
            </p>
          ) : selected && selected.stock <= LOW_STOCK ? (
            <p className="mt-2 text-sm text-warning">
              {selected.stock === 1 ? "¡Queda la última!" : `¡Quedan solo ${selected.stock}!`}
            </p>
          ) : null}
        </fieldset>

        <div className="mt-6 hidden md:block">{cta}</div>

        {whatsapp ? (
          <a
            href={whatsappUrl(whatsapp, helpText)}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 flex items-center justify-center gap-2 py-2 text-sm text-muted hover:text-white"
          >
            <MessageCircle className="size-4" aria-hidden /> ¿Dudas con tu talla? Escríbenos por WhatsApp
          </a>
        ) : null}

        <div className="mt-4">{details}</div>
      </div>

      {/* Móvil: el botón de compra siempre a mano, pegado abajo. */}
      <div data-sticky-bar="md" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-ink/95 px-4 pt-3 backdrop-blur-md pb-safe md:hidden">
        <div className="flex items-center gap-3 min-[360px]:gap-4">
          <div className="shrink-0">
            <p className="text-lg leading-none font-bold">{formatPrice(displayPrice.priceCents)}</p>
            <p className="mt-1 text-xs text-muted">{size ? `${color.name} · ${size.label}` : color.name}</p>
          </div>
          <div className="min-w-0 flex-1">{cta}</div>
        </div>
      </div>

      {product.sizeGuide ? (
        <SizeGuideSheet open={guideOpen} onClose={() => setGuideOpen(false)} text={product.sizeGuide} selectedSize={size?.label} />
      ) : null}
    </div>
  );
}
