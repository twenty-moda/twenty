import { getAllDistricts } from "@/app/(store)/_data";

// Estático y cacheado en el CDN: [ubigeo, distrito, provincia, departamento][]
export async function GET() {
  return Response.json(await getAllDistricts());
}
