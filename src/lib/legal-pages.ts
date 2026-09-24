import type { LegalKey } from "@/server/services/content";

/** Páginas legales: mismas URLs que la web anterior (las enlazan Google y el llms.txt). */
export const LEGAL_PAGES: { key: LegalKey; href: string; title: string; description: string }[] = [
  {
    key: "terms",
    href: "/terminos-y-condiciones",
    title: "Términos y condiciones",
    description: "Condiciones de compra en TWENTY: productos, pagos, envíos, cambios y responsabilidades.",
  },
  {
    key: "privacy",
    href: "/politica-de-privacidad",
    title: "Política de privacidad",
    description: "Cómo TWENTY recopila, usa y protege tus datos personales.",
  },
  {
    key: "shipping",
    href: "/politicas-de-envio",
    title: "Políticas de envío",
    description: "Cobertura, costos y tiempos de entrega de TWENTY en Lima y provincias.",
  },
  {
    key: "returns",
    href: "/politicas-de-devolucion-y-cambio",
    title: "Cambios y devoluciones",
    description: "Cuándo y cómo puedes cambiar una prenda comprada en TWENTY.",
  },
];

export const legalPage = (key: LegalKey) => LEGAL_PAGES.find((p) => p.key === key)!;
