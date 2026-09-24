import type { Metadata } from "next";
import { Suspense } from "react";
import { PasswordReset } from "@/components/account/password-reset";
import { ProfileForm } from "@/components/account/profile-form";
import { firebaseWebConfig } from "@/lib/firebase-config";
import { getDb } from "@/server/db/client";
import { getAccountProfile } from "@/server/services/accounts";
import { requireAccount } from "../../_lib/account";

export const metadata: Metadata = { title: "Mis datos", robots: { index: false } };

export default function AccountProfilePage() {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-raised" aria-busy="true" />}>
      <Profile />
    </Suspense>
  );
}

async function Profile() {
  const user = await requireAccount("/cuenta/datos");
  const profile = await getAccountProfile(getDb(), user);
  return (
    <div className="space-y-4">
      <section aria-labelledby="mis-datos" className="rounded-2xl border border-line p-5 md:p-8">
        <h2 id="mis-datos" className="text-lg font-bold">
          Mis datos
        </h2>
        <p className="mt-1 mb-6 text-sm text-muted">Los usamos para llenar tu checkout. Se actualizan también cada vez que compras.</p>
        <ProfileForm profile={profile} />
      </section>
      <section aria-labelledby="contrasena" className="rounded-2xl border border-line p-5 md:p-8">
        <h2 id="contrasena" className="text-lg font-bold">
          Contraseña
        </h2>
        <p className="mt-1 mb-4 text-sm text-muted">
          Puedes entrar con Google o con tu correo y contraseña: es la misma cuenta. Te enviamos un enlace a {user.email} para crearla o cambiarla.
        </p>
        <PasswordReset email={user.email} config={firebaseWebConfig()} />
      </section>
    </div>
  );
}
