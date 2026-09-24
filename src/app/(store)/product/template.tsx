import { PageTransition } from "@/components/store/page-transition";

// Se vuelve a montar al pasar de un producto a otro (/product/a → /product/b): también anima ese cambio.
export default function Template({ children }: { children: React.ReactNode }) {
  return <PageTransition>{children}</PageTransition>;
}
