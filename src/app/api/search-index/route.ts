import { getProductCards } from "@/app/(store)/_data";
import { toSearchEntry } from "@/lib/search";

// Se prerenderiza con el catálogo cacheado y se invalida con el mismo tag.
export async function GET() {
  const cards = await getProductCards();
  return Response.json(cards.map(toSearchEntry));
}
