"use client";

import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { hidePrivateIds } from "@/lib/analytics";

// Fuera del componente para que sea la misma función en cada render (las dos librerías la registran en un efecto).
function withoutPrivateIds<T extends { url: string }>(event: T): T {
  return { ...event, url: hidePrivateIds(event.url) };
}

/**
 * Visitas (Vercel Web Analytics) y rendimiento medido en los teléfonos de los clientes (Speed Insights). Van solo en la
 * tienda, así el panel no gasta la cuota. Cada una trae su propio `<Suspense>`: la página sigue siendo estática.
 */
export function VercelInsights() {
  return (
    <>
      <Analytics beforeSend={withoutPrivateIds} />
      <SpeedInsights beforeSend={withoutPrivateIds} />
    </>
  );
}
