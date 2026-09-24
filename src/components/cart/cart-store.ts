"use client";

import { useSyncExternalStore } from "react";
import { addLine, setLineQuantity, type CartLine } from "@/lib/cart";

const STORAGE_KEY = "twenty.cart.v1";
const EMPTY: CartLine[] = [];

let lines: CartLine[] = EMPTY;
let initialized = false;
const listeners = new Set<() => void>();

function isCartLine(value: unknown): value is CartLine {
  const v = value as CartLine;
  return !!v && typeof v.variantId === "string" && typeof v.quantity === "number" && typeof v.priceCents === "number";
}

function readStorage(): CartLine[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter(isCartLine) : EMPTY;
  } catch {
    return EMPTY;
  }
}

function init() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  lines = readStorage();
  // Otra pestaña cambió el carrito.
  window.addEventListener("storage", (event) => {
    if (event.key !== STORAGE_KEY) return;
    lines = readStorage();
    emit();
  });
}

function emit() {
  for (const listener of listeners) listener();
}

function commit(next: CartLine[]) {
  lines = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Modo privado o almacenamiento lleno: el carrito sigue en memoria.
  }
  emit();
}

export const cartStore = {
  subscribe(listener: () => void) {
    init();
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getSnapshot() {
    init();
    return lines;
  },
  getServerSnapshot() {
    return EMPTY;
  },
  add(line: Omit<CartLine, "quantity">, quantity = 1) {
    commit(addLine(lines, line, quantity));
  },
  setQuantity(variantId: string, quantity: number) {
    commit(setLineQuantity(lines, variantId, quantity));
  },
  remove(variantId: string) {
    commit(lines.filter((l) => l.variantId !== variantId));
  },
  replace(next: CartLine[]) {
    commit(next);
  },
};

export function useCartLines(): CartLine[] {
  return useSyncExternalStore(cartStore.subscribe, cartStore.getSnapshot, cartStore.getServerSnapshot);
}

const noopSubscribe = () => () => {};

/** false en el HTML estático y al hidratar; true cuando ya se leyó el carrito del navegador. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}
