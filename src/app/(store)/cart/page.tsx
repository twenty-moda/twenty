import type { Metadata } from "next";
import { CartView } from "@/components/cart/cart-view";

export const metadata: Metadata = {
  title: "Carrito",
  robots: { index: false },
  alternates: { canonical: "/cart" },
};

export default function CartPage() {
  return <CartView />;
}
