import { absoluteMediaUrl, siteUrl } from "@/lib/links";
import { getFeedVariants } from "../(store)/_data";

// Mismo formato que el feed de la web anterior (lo enlaza llms.txt): una fila por SKU, precios en soles.
export async function GET() {
  const { variants, generatedAt } = await getFeedVariants();
  const base = siteUrl();
  const products = variants.map((v) => ({
    sku: v.sku,
    name: `${v.productName} - ${v.color} - ${v.size}`,
    description: v.description ?? "",
    category: v.category,
    color: v.color,
    size: v.size,
    image_url: v.image ? absoluteMediaUrl(v.image) : null,
    url: `${base}/product/${v.productSlug}?${new URLSearchParams({ color: v.colorSlug, talla: v.size })}`,
    price: (v.compareAtPriceCents ?? v.priceCents) / 100,
    discount: v.compareAtPriceCents ? (v.compareAtPriceCents - v.priceCents) / 100 : 0,
    final_price: v.priceCents / 100,
    currency: "PEN",
    in_stock: v.stock > 0,
    stock_qty: v.stock,
  }));
  return Response.json({ store_name: "TWENTY", feed_generated_at: generatedAt, products_count: products.length, products });
}
