import type { Metadata } from "next";
import { Suspense } from "react";
import { ProfileForm } from "@/components/account/profile-form";
import { getDb } from "@/server/db/client";
import { getAccountProfile } from "@/server/services/accounts";
import { requireAccount } from "../../_lib/account";

export const metadata: Metadata = { title: "Mis datos", robots: { index: false } };

export default function AccountProfilePage() {
  return (
    <section aria-labelledby="mis-datos" className="rounded-2xl border border-line p-5 md:p-8">
      <h2 id="mis-datos" className="text-lg font-bold">
        Mis datos
      </h2>
      <p className="mt-1 mb-6 text-sm text-muted">Los usamos para llenar tu checkout. Se actualizan también cada vez que compras.</p>
      <Suspense fallback={<div className="h-80 animate-pulse rounded-xl bg-raised" aria-busy="true" />}>
        <Profile />
      </Suspense>
    </section>
  );
}

async function Profile() {
  const user = await requireAccount("/cuenta/datos");
  const profile = await getAccountProfile(getDb(), user);
  return <ProfileForm profile={profile} />;
}
