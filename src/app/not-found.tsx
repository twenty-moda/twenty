import Link from "next/link";
import { Logo } from "@/components/store/logo";
import { NotFoundContent } from "@/components/store/not-found-content";

// Rutas que no existen en ninguna sección (fuera del layout de la tienda).
export default function NotFound() {
  return (
    <>
      <header className="flex h-14 items-center justify-center border-b border-line">
        <Link href="/" aria-label="TWENTY, ir al inicio" className="flex h-12 items-center px-2">
          <Logo />
        </Link>
      </header>
      <NotFoundContent />
    </>
  );
}
