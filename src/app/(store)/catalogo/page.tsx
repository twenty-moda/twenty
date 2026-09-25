import type { Metadata } from "next";
import { CatalogBrowser } from "@/components/catalog/catalog-browser";
import { promoSections } from "@/lib/promos";
import { getCategoryLinks, getProductCards } from "../_data";

export const metadata: Metadata = {
  title: "Catálogo",
  description: "Baggy jeans, mom jeans, polos, hoodies, camisas y casacas. Elige tu talla y color y recíbelo en 24 a 48 horas en Lima.",
  alternates: { canonical: "/catalogo" },
};

export default async function CatalogPage() {
  const [products, categories] = await Promise.all([getProductCards(), getCategoryLinks()]);
  return <CatalogBrowser products={products} categories={categories} showPromos={promoSections(products).productCount > 0} />;
}
