"use client";

import { Check, ShoppingBag } from "lucide-react";
import Link from "next/link";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { cartTotals } from "@/lib/cart";
import { formatPrice } from "@/lib/money";
import { priceLines } from "@/lib/pricing";
import { Sheet } from "../ui/sheet";
import { CartLineItem } from "./cart-line-item";
import { useCartLines } from "./cart-store";
import { PromotionHints } from "./promotion-hints";

type CartUI = {
  /** Abre el carrito; si se pasa una variante, se marca como recién agregada. */
  openCart: (addedVariantId?: string) => void;
};

const CartUIContext = createContext<CartUI | null>(null);

export function useCartUI(): CartUI {
  const ctx = useContext(CartUIContext);
  if (!ctx) throw new Error("useCartUI debe usarse dentro de <CartProvider>");
  return ctx;
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [addedVariantId, setAddedVariantId] = useState<string | null>(null);
  const openCart = useCallback((variantId?: string) => {
    setAddedVariantId(variantId ?? null);
    setOpen(true);
  }, []);
  const value = useMemo(() => ({ openCart }), [openCart]);

  return (
    <CartUIContext.Provider value={value}>
      {children}
      <CartDrawer open={open} onClose={() => setOpen(false)} addedVariantId={addedVariantId} />
    </CartUIContext.Provider>
  );
}

function CartDrawer({ open, onClose, addedVariantId }: { open: boolean; onClose: () => void; addedVariantId: string | null }) {
  const lines = useCartLines();
  const { units } = cartTotals(lines);
  const pricing = priceLines(lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity, unitPriceCents: l.priceCents, promotion: l.promotion })));
  const added = addedVariantId ? lines.find((l) => l.variantId === addedVariantId) : null;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={`Tu carrito${units ? ` (${units})` : ""}`}
      footer={
        lines.length ? (
          <div className="space-y-3">
            {pricing.discountCents ? (
              <div className="flex items-baseline justify-between text-sm text-success">
                <span>Promociones</span>
                <span>-{formatPrice(pricing.discountCents)}</span>
              </div>
            ) : null}
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-muted">Total sin envío</span>
              <span className="text-lg font-semibold">{formatPrice(pricing.totalCents)}</span>
            </div>
            <Link
              href="/checkout"
              onClick={onClose}
              className="flex h-12 w-full items-center justify-center rounded-full bg-white text-sm font-semibold tracking-wide text-black uppercase"
            >
              Ir a pagar
            </Link>
            <Link href="/cart" onClick={onClose} className="flex h-11 w-full items-center justify-center text-sm underline underline-offset-4">
              Ver carrito completo
            </Link>
          </div>
        ) : null
      }
    >
      {added ? (
        <p role="status" className="flex items-center gap-2 bg-success/15 px-4 py-3 text-sm">
          <Check className="size-4 text-success" aria-hidden /> Agregaste <strong className="font-semibold">{added.productName}</strong>
        </p>
      ) : null}

      {lines.length ? (
        <div className="px-4">
          <ul className="divide-y divide-line">
            {lines.map((line) => (
              <CartLineItem key={line.variantId} line={line} onNavigate={onClose} />
            ))}
          </ul>
          <div className="pb-4">
            <PromotionHints lines={lines} />
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center px-6 py-16 text-center">
          <ShoppingBag className="size-10 text-subtle" aria-hidden />
          <p className="mt-4 font-semibold">Tu carrito está vacío</p>
          <p className="mt-1 text-sm text-muted">Mira lo nuevo y arma tu outfit.</p>
          <Link
            href="/catalogo"
            onClick={onClose}
            className="mt-6 inline-flex h-12 items-center rounded-full bg-white px-8 text-sm font-semibold tracking-wide text-black uppercase"
          >
            Ver catálogo
          </Link>
        </div>
      )}
    </Sheet>
  );
}
