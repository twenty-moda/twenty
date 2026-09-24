import { PageTransition } from "@/components/store/page-transition";

// El template se vuelve a montar en cada navegación de este nivel: ahí corre la transición de página.
export default function Template({ children }: { children: React.ReactNode }) {
  return <PageTransition>{children}</PageTransition>;
}
