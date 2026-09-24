import Link from "next/link";

export function NotFoundContent() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-6 py-24 text-center">
      <p className="text-6xl font-extrabold tracking-tight">404</p>
      <h1 className="mt-4 text-xl font-bold">No encontramos esta página</h1>
      <p className="mt-2 text-muted">Puede que la prenda ya no esté disponible o que el enlace haya cambiado.</p>
      <Link href="/catalogo" className="mt-8 inline-flex h-12 items-center rounded-full bg-white px-8 text-sm font-semibold text-black uppercase">
        Ver catálogo
      </Link>
      <Link href="/" className="mt-2 inline-flex min-h-10 items-center text-sm underline underline-offset-4">
        Ir al inicio
      </Link>
    </div>
  );
}
