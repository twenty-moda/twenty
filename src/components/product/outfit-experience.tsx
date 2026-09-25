"use client";

import { ArrowUpRight, Layers, MessageCircle, Ruler } from "lucide-react";
import Link from "next/link";
import { useRef, useState, ViewTransition, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { siteUrl, whatsappUrl } from "@/lib/links";
import { formatPrice } from "@/lib/money";
import { outfitLineKey, outfitStock } from "@/lib/outfits";
import type { OutfitDetail, OutfitPieceDetail } from "@/server/services/catalog";
import { useCartUI } from "../cart/cart-provider";
import { cartStore } from "../cart/cart-store";
import { Breadcrumbs, type Crumb } from "../store/breadcrumbs";
import { Price } from "../store/price";
import { productMorphName } from "../store/product-card";
import { ColorSwatches, SizeGrid } from "./option-pickers";
import { ProductGallery } from "./product-gallery";
import { SizeGuideSheet } from "./size-guide-sheet";

type OutfitExperienceProps = {
  outfit: OutfitDetail;
  whatsapp: string;
  breadcrumbs: Crumb[];
  details: ReactNode;
};

type Choice = { colorId: string; sizeId: string | null };

const LOW_STOCK = 2;
const hasStock = (piece: OutfitPieceDetail, colorId: string) => piece.variants.some((v) => v.colorId === colorId && v.stock > 0);
const variantOf = (piece: OutfitPieceDetail, choice: Choice) =>
  choice.sizeId ? piece.variants.find((v) => v.colorId === choice.colorId && v.sizeId === choice.sizeId) : undefined;

/**
 * Ficha de un conjunto: una sección por pieza (color y talla de cada prenda) y un solo botón para agregar el conjunto.
 * El stock es el de cada prenda: si una talla se agota por separado, también se agota aquí.
 */
export function OutfitExperience({ outfit, whatsapp, breadcrumbs, details }: OutfitExperienceProps) {
  const { openCart } = useCartUI();
  const [choices, setChoices] = useState<Choice[]>(() =>
    outfit.pieces.map((piece) => ({ colorId: (piece.colors.find((c) => hasStock(piece, c.id)) ?? piece.colors[0]).id, sizeId: null })),
  );
  const [missing, setMissing] = useState<number[]>([]);
  const [guide, setGuide] = useState<number | null>(null);
  const pieceRefs = useRef<(HTMLElement | null)[]>([]);

  const selected = outfit.pieces.map((piece, i) => {
    const variant = variantOf(piece, choices[i]);
    return variant && variant.stock > 0 ? variant : undefined;
  });
  const complete = selected.every(Boolean);
  const inStock = outfit.pieces.every((piece) => piece.variants.some((v) => v.stock > 0));

  const update = (index: number, patch: Partial<Choice>) => {
    setChoices((cs) => cs.map((c, i) => (i === index ? { ...c, ...patch } : c)));
    setMissing((m) => m.filter((i) => i !== index));
  };

  const chooseColor = (index: number, colorId: string) => {
    const piece = outfit.pieces[index];
    const current = choices[index];
    // Se mantiene la talla si existe con stock en el color nuevo.
    const keep = current.sizeId && piece.variants.some((v) => v.colorId === colorId && v.sizeId === current.sizeId && v.stock > 0);
    update(index, { colorId, sizeId: keep ? current.sizeId : null });
  };

  const addToCart = () => {
    const pending = outfit.pieces.map((_, i) => i).filter((i) => !selected[i]);
    if (pending.length) {
      setMissing(pending);
      const section = pieceRefs.current[pending[0]];
      section?.scrollIntoView({ behavior: "smooth", block: "center" });
      section?.classList.remove("animate-shake");
      void section?.offsetWidth; // reinicia la animación
      section?.classList.add("animate-shake");
      return;
    }
    const pieces = outfit.pieces.map((piece, i) => {
      const variant = selected[i]!;
      const color = piece.colors.find((c) => c.id === variant.colorId)!;
      return {
        variantId: variant.id,
        label: piece.label,
        productName: piece.name,
        productSlug: piece.slug,
        colorName: color.name,
        sizeLabel: piece.sizes.find((s) => s.id === variant.sizeId)!.label,
        image: color.images[0]?.path ?? null,
        priceCents: variant.priceCents,
        stock: variant.stock,
      };
    });
    const key = outfitLineKey(
      outfit.id,
      pieces.map((p) => p.variantId),
    );
    const separately = pieces.reduce((sum, p) => sum + p.priceCents, 0);
    cartStore.add(
      {
        variantId: key,
        productSlug: outfit.slug,
        productName: outfit.name,
        colorName: "",
        sizeLabel: "",
        image: outfit.images[0]?.path ?? pieces[0].image,
        priceCents: outfit.priceCents,
        compareAtPriceCents: separately > outfit.priceCents ? separately : null,
        stock: outfitStock(pieces),
        promotion: null,
        outfit: { id: outfit.id, pieces },
      },
      1,
    );
    openCart(key);
  };

  const ctaLabel = !inStock ? "Agotado" : complete ? "Agregar conjunto" : "Elige las tallas";
  const summary = outfit.pieces
    .map((piece, i) => {
      const color = piece.colors.find((c) => c.id === choices[i].colorId);
      const size = piece.sizes.find((s) => s.id === selected[i]?.sizeId);
      return `${piece.label} ${color?.name ?? ""}${size ? ` ${size.label}` : ""}`;
    })
    .join(" + ");
  const helpText = `Hola, tengo una consulta sobre el conjunto ${outfit.name} (${summary}): ${siteUrl()}/product/${outfit.slug}`;

  const cta = (
    <button
      type="button"
      onClick={addToCart}
      disabled={!inStock}
      className="h-13 w-full rounded-full bg-white px-3 text-[13px] leading-tight font-bold tracking-wide text-black uppercase transition active:scale-[0.98] disabled:bg-raised disabled:text-subtle min-[360px]:text-sm"
    >
      {ctaLabel}
    </button>
  );

  return (
    <div className="mx-auto max-w-7xl pb-28 md:grid md:grid-cols-2 md:gap-8 md:px-6 md:pt-6 md:pb-0 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:gap-10 2xl:max-w-[96rem]">
      <ViewTransition name={productMorphName(outfit.slug)} share="morph" default="none">
        <ProductGallery images={outfit.images} eager />
      </ViewTransition>

      <div className="min-w-0 px-4 pt-5 md:sticky md:top-20 md:self-start md:px-0 md:pt-0">
        <Breadcrumbs items={breadcrumbs} />
        <h1 className="mt-2 text-xl leading-tight font-bold md:text-2xl">{outfit.name}</h1>
        <Price className="mt-2" size="lg" priceCents={outfit.priceCents} compareAtPriceCents={outfit.compareAtPriceCents} compareLabel="Por separado" />

        <p className="mt-4 flex items-center gap-2 rounded-lg bg-white px-3 py-2.5 text-sm text-black">
          <Layers className="size-4 shrink-0" aria-hidden />
          <span>
            <strong className="font-bold">Conjunto de {outfit.pieces.length} piezas</strong>: elige el color y la talla de cada una.
          </span>
        </p>

        <ol className="mt-6 space-y-4">
          {outfit.pieces.map((piece, i) => {
            const choice = choices[i];
            const color = piece.colors.find((c) => c.id === choice.colorId) ?? piece.colors[0];
            const variant = selected[i];
            const size = piece.sizes.find((s) => s.id === variant?.sizeId);
            const needsSize = missing.includes(i);
            return (
              <li
                key={piece.productId + i}
                ref={(el) => {
                  pieceRefs.current[i] = el;
                }}
                className={cn("rounded-xl border p-4 transition-colors", needsSize ? "border-warning" : "border-line")}
              >
                <div className="flex items-start gap-3">
                  <span className="grid size-7 shrink-0 place-items-center rounded-full bg-white text-sm font-bold text-black" aria-hidden>
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold tracking-wide text-muted uppercase">{piece.label}</p>
                    <p className="leading-snug font-semibold">{piece.name}</p>
                  </div>
                  {piece.soldSeparately ? (
                    <Link href={`/product/${piece.slug}`} className="-my-1 inline-flex min-h-10 shrink-0 items-center gap-1 text-xs text-muted underline-offset-4 hover:text-white hover:underline">
                      Ver prenda <ArrowUpRight className="size-3.5" aria-hidden />
                    </Link>
                  ) : null}
                </div>

                <fieldset className="mt-4 min-w-0">
                  <legend className="text-sm">
                    <span className="text-muted">Color: </span>
                    <span className="font-semibold">{color.name}</span>
                  </legend>
                  <ColorSwatches colors={piece.colors} activeId={color.id} inStock={(id) => hasStock(piece, id)} onChoose={(id) => chooseColor(i, id)} small />
                </fieldset>

                <fieldset className="mt-4 min-w-0" aria-describedby={needsSize ? `talla-error-${i}` : undefined}>
                  <div className="flex items-center justify-between">
                    <legend className="text-sm">
                      <span className="text-muted">Talla: </span>
                      <span className="font-semibold">{size?.label ?? "elige una"}</span>
                    </legend>
                    {piece.sizeGuide ? (
                      <button type="button" onClick={() => setGuide(i)} className="-my-2 inline-flex h-10 items-center gap-1.5 text-sm underline underline-offset-4">
                        <Ruler className="size-4" aria-hidden /> Guía de tallas
                      </button>
                    ) : null}
                  </div>
                  <SizeGrid
                    sizes={piece.sizes}
                    activeId={size?.id}
                    stateOf={(sizeId) => {
                      const v = piece.variants.find((x) => x.colorId === color.id && x.sizeId === sizeId);
                      return !v ? "missing" : v.stock > 0 ? "available" : "sold-out";
                    }}
                    onChoose={(label) => update(i, { colorId: color.id, sizeId: piece.sizes.find((s) => s.label === label)!.id })}
                    highlight={needsSize}
                  />
                  {needsSize ? (
                    <p id={`talla-error-${i}`} role="alert" className="mt-2 text-sm text-warning">
                      {hasStock(piece, color.id) ? `Elige la talla de ${piece.label.toLowerCase()}.` : "Este color está agotado: elige otro."}
                    </p>
                  ) : variant && variant.stock <= LOW_STOCK ? (
                    <p className="mt-2 text-sm text-warning">{variant.stock === 1 ? "¡Queda la última!" : `¡Quedan solo ${variant.stock}!`}</p>
                  ) : null}
                </fieldset>
              </li>
            );
          })}
        </ol>

        <div className="mt-6 hidden md:block">{cta}</div>

        {whatsapp ? (
          <a
            href={whatsappUrl(whatsapp, helpText)}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 flex items-center justify-center gap-2 py-2 text-sm text-muted hover:text-white"
          >
            <MessageCircle className="size-4" aria-hidden /> ¿Dudas con las tallas? Escríbenos por WhatsApp
          </a>
        ) : null}

        <div className="mt-4">{details}</div>
      </div>

      <div data-sticky-bar="md" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-ink/95 px-4 pt-3 backdrop-blur-md pb-safe md:hidden">
        <div className="flex items-center gap-3 min-[360px]:gap-4">
          <div className="shrink-0">
            <p className="text-lg leading-none font-bold">{formatPrice(outfit.priceCents)}</p>
            <p className="mt-1 text-xs text-muted">
              {complete ? "Conjunto listo" : `${selected.filter(Boolean).length} de ${outfit.pieces.length} tallas`}
            </p>
          </div>
          <div className="min-w-0 flex-1">{cta}</div>
        </div>
      </div>

      {outfit.pieces.map((piece, i) =>
        piece.sizeGuide ? (
          <SizeGuideSheet
            key={piece.productId + i}
            open={guide === i}
            onClose={() => setGuide(null)}
            text={piece.sizeGuide}
            selectedSize={piece.sizes.find((s) => s.id === selected[i]?.sizeId)?.label}
          />
        ) : null,
      )}
    </div>
  );
}
