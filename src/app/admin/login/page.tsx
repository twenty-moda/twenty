import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Logo } from "@/components/store/logo";
import { firebaseWebConfig } from "@/lib/firebase-config";
import { panelHome } from "@/lib/panel-access";
import { getStaff } from "../_lib/auth";
import { LoginOptions } from "./login-options";

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
            <LoginOptions firebase={firebaseWebConfig()} />
          </RedirectIfLoggedIn>
        </Suspense>
      </div>
    </main>
  );
}

async function RedirectIfLoggedIn({ children }: { children: React.ReactNode }) {
  const user = await getStaff();
  if (user) redirect(panelHome(user.role));
  return children;
}
