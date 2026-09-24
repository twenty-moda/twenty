import { getShalomAgencies } from "@/app/(store)/_data";

// Estático y cacheado en el CDN (se renueva una vez al día): agencias de Shalom para elegir en el checkout.
export async function GET() {
  return Response.json(await getShalomAgencies());
}
