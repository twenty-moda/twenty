"use client";

import { AlertCircle, ShieldCheck, ShoppingBag } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { refreshCart } from "@/app/(store)/cart/actions";
import { cartTotals, reconcileCart, type CartNotice } from "@/lib/cart";
import { formatPrice } from "@/lib/money";
import { priceLines } from "@/lib/pricing";
import { CartLineItem } from "./cart-line-item";
import { cartStore, useCartLines, useHydrated } from "./cart-store";
import { PromotionHints } from "./promotion-hints";

function noticeText(n: CartNotice) {
  switch (n.type) {
    case "removed":
      return `${n.productName} (${n.variantLabel}) se agotó y lo quitamos de tu carrito.`;
    case "reduced":
      return `${n.productName} (${n.variantLabel}): solo quedan ${n.quantity}, ajustamos la cantidad.`;
    case "price":
      return `${n.productName} (${n.variantLabel}) cambió de precio: ahora ${formatPrice(n.after)}.`;
  }
}

export function CartView() {
  const lines = useCartLines();
  const hydrated = useHydrated();
  const [notices, setNotices] = useState<CartNotice[]>([]);
  const refreshed = useRef(false);
  const { units, savingsCents } = cartTotals(lines);
  const pricing = priceLines(lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity, unitPriceCents: l.priceCents, promotion: l.promotion })));

  // Al abrir el carrito se confirma con el servidor que precio y stock siguen vigentes.
  useEffect(() => {
    if (refreshed.current || lines.length === 0) return;
    refreshed.current = true;
    refreshCart(lines.map((l) => l.variantId))
      .then((snapshots) => {
        const result = reconcileCart(cartStore.getSnapshot(), snapshots);
        cartStore.replace(result.lines);
        setNotices(result.notices);
      })
      .catch(() => {
        refreshed.current = false;
      });
  }, [lines]);

  if (!hydrated) {
    return <p className="px-4 py-24 text-center text-muted">Cargando tu carrito…</p>;
  }

  if (lines.length === 0) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center px-6 py-24 text-center">
        <ShoppingBag className="size-12 text-subtle" aria-hidden />
        <h1 className="mt-5 text-xl font-bold">Tu carrito está vacío</h1>
        {notices.length ? (
          <ul className="mt-4 space-y-2 text-sm text-warning">
            {notices.map((n, i) => (
              <li key={i}>{noticeText(n)}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-muted">Agrega tus prendas favoritas y vuelve aquí para pagar.</p>
        )}
        <Link href="/catalogo" className="mt-8 inline-flex h-12 items-center rounded-full bg-white px-8 text-sm font-semibold text-black uppercase">
          Ver catálogo
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl 2xl:max-w-[96rem] px-4 pt-6 pb-32 lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-12 lg:px-6 lg:pb-12">
      <section aria-labelledby="carrito">
        <h1 id="carrito" className="text-2xl font-extrabold tracking-tight uppercase">
          Carrito <span className="text-muted">({units})</span>
        </h1>

        {notices.length ? (
          <ul role="status" className="mt-4 space-y-2">
            {notices.map((n, i) => (
              <li key={i} className="flex gap-2 rounded-lg bg-warning/15 px-3 py-2.5 text-sm text-warning">
                <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden /> {noticeText(n)}
              </li>
            ))}
          </ul>
        ) : null}

        <ul className="mt-2 divide-y divide-line border-b border-line">
          {lines.map((line) => (
            <CartLineItem key={line.variantId} line={line} />
          ))}
        </ul>
        <div className="mt-4">
          <PromotionHints lines={lines} />
        </div>
        <Link href="/catalogo" className="mt-4 inline-flex min-h-10 items-center text-sm underline underline-offset-4">
          Seguir comprando
        </Link>
      </section>

      <aside aria-label="Resumen" className="mt-8 lg:mt-0">
        <div className="rounded-2xl bg-raised p-5 lg:sticky lg:top-20">
          <h2 className="text-sm font-bold tracking-widest uppercase">Resumen</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted">Subtotal</dt>
              <dd>{formatPrice(pricing.subtotalCents)}</dd>
            </div>
            {pricing.discountCents ? (
              <div className="flex justify-between text-success">
                <dt>Promociones</dt>
                <dd>-{formatPrice(pricing.discountCents)}</dd>
              </div>
            ) : null}
            <div className="flex justify-between">
              <dt className="text-muted">Envío</dt>
              <dd className="text-right text-muted">Lo eliges en el siguiente paso</dd>
            </div>
            <div className="flex justify-between border-t border-line pt-3 text-base font-bold">
              <dt>Total</dt>
              <dd>{formatPrice(pricing.totalCents)}</dd>
            </div>
          </dl>
          {savingsCents + pricing.discountCents > 0 ? (
            <p className="mt-2 text-xs text-success">Ahorras {formatPrice(savingsCents + pricing.discountCents)} en esta compra.</p>
          ) : null}
          <Link
            href="/checkout"
            className="mt-5 hidden h-13 items-center justify-center rounded-full bg-white text-sm font-bold tracking-wide text-black uppercase lg:flex"
          >
            Continuar compra
          </Link>
          <p className="mt-4 flex items-center gap-2 text-xs text-muted">
            <ShieldCheck className="size-4" aria-hidden /> Pago seguro con Yape, Plin o tarjeta
          </p>
        </div>
      </aside>

      <div data-sticky-bar="lg" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-ink/95 px-4 pt-3 backdrop-blur-md pb-safe lg:hidden">
        <Link href="/checkout" className="flex h-13 items-center justify-between rounded-full bg-white px-6 text-sm font-bold tracking-wide text-black uppercase">
          <span>Continuar compra</span>
          <span>{formatPrice(pricing.totalCents)}</span>
        </Link>
      </div>
    </div>
  );
}
