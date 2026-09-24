import { MapPin, Package, Zap } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { GoogleSignIn } from "@/components/account/google-sign-in";
import { PageHeader } from "@/components/store/page-header";
import { safeReturnPath } from "@/lib/account-forms";
import { firebaseWebConfig } from "@/lib/firebase-config";
import { getAccount } from "../_lib/account";

export const metadata: Metadata = {
  title: "Ingresa a tu cuenta",
  description: "Entra con Google para ver tus pedidos y guardar tus datos y direcciones.",
  robots: { index: false },
  alternates: { canonical: "/ingresar" },
};

const BENEFITS = [
  { icon: Package, text: "Tus pedidos y en qué estado van" },
  { icon: MapPin, text: "Tus direcciones guardadas" },
  { icon: Zap, text: "Checkout más rápido: tus datos ya llenos" },
];

export default function SignInPage({ searchParams }: PageProps<"/ingresar">) {
  return (
    <>
      <PageHeader eyebrow="Tu cuenta" title="Ingresa" description="Sin contraseñas: entra con tu cuenta de Google." />
      <div className="mx-auto max-w-md px-4 pb-16">
        <div className="rounded-2xl border border-line bg-surface p-5 md:p-8">
          <ul className="mb-6 space-y-3">
            {BENEFITS.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-sm">
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-raised">
                  <Icon className="size-4" aria-hidden />
                </span>
                {text}
              </li>
            ))}
          </ul>
          <Suspense fallback={<div className="h-13 animate-pulse rounded-full bg-raised" aria-busy="true" />}>
            <SignIn searchParams={searchParams} />
          </Suspense>
          <p className="mt-4 text-center text-xs text-subtle">Solo usamos tu nombre, tu email y tu foto de Google.</p>
        </div>
        <p className="mt-6 text-center text-sm text-muted">
          También puedes comprar sin cuenta. ¿Solo quieres ver un pedido?{" "}
          <Link href="/tracking" className="font-semibold text-white underline underline-offset-4">
            Rastréalo con su número
          </Link>
        </p>
      </div>
    </>
  );
}

async function SignIn({ searchParams }: Pick<PageProps<"/ingresar">, "searchParams">) {
  const returnTo = safeReturnPath((await searchParams).volver);
  if (await getAccount()) redirect(returnTo);
  return <GoogleSignIn config={firebaseWebConfig()} returnTo={returnTo} />;
}
