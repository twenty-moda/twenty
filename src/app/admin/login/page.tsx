import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { FirebaseSignIn } from "@/components/account/firebase-sign-in";
import { Logo } from "@/components/store/logo";
import { firebaseWebConfig } from "@/lib/firebase-config";
import { getAdmin } from "../_lib/auth";

// El admin se arma en el servidor en cada visita (lee la sesión): no se exige navegación instantánea.
export const instant = false;
export const metadata: Metadata = { title: "Entrar" };

export default function AdminLoginPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <Logo className="w-36" priority />
          <p className="text-sm text-muted">Panel de administración</p>
        </div>
        <Suspense fallback={<div className="h-96" aria-busy="true" />}>
          <RedirectIfLoggedIn>
            <FirebaseSignIn config={firebaseWebConfig()} mode="admin" returnTo="/admin" />
          </RedirectIfLoggedIn>
        </Suspense>
        <p className="mt-6 text-center text-xs text-subtle">
          Es tu misma cuenta de la tienda. ¿Te dieron acceso y no tienes contraseña? Entra con Google o toca «Crear contraseña» con ese correo.
        </p>
      </div>
    </main>
  );
}

async function RedirectIfLoggedIn({ children }: { children: React.ReactNode }) {
  if (await getAdmin()) redirect("/admin");
  return children;
}
