import { LogOut } from "lucide-react";
import { Suspense } from "react";
import { AccountTabs } from "@/components/account/account-tabs";
import { getDb } from "@/server/db/client";
import { getAccountUser } from "@/server/services/accounts";
import { getAccount } from "../_lib/account";
import { signOutAction } from "./actions";

/** Mi cuenta: saludo, pestañas y cerrar sesión. Cada página pide la sesión (y manda a /ingresar si no hay). */
export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl px-4 pt-6 pb-16">
      <Suspense fallback={<div className="h-16 animate-pulse rounded-2xl bg-raised" aria-busy="true" />}>
        <AccountHeader />
      </Suspense>
      <AccountTabs />
      <div className="mt-6">{children}</div>
    </div>
  );
}

async function AccountHeader() {
  const account = await getAccount();
  const user = account ? await getAccountUser(getDb(), account.id) : null;
  if (!user) return <div className="h-16" />;
  return (
    <div className="flex items-center gap-3">
      {user.photoUrl ? (
        // Foto de Google: <img> directo (sin optimizar en Vercel) y sin referrer, que Google a veces rechaza.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={user.photoUrl} alt="" width={56} height={56} referrerPolicy="no-referrer" className="size-14 shrink-0 rounded-full bg-raised object-cover" />
      ) : (
        <span className="grid size-14 shrink-0 place-items-center rounded-full bg-raised text-xl font-bold uppercase" aria-hidden>
          {user.name.charAt(0)}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold tracking-widest text-muted uppercase">Mi cuenta</p>
        <h1 className="truncate text-xl font-extrabold tracking-tight">Hola, {user.name.split(" ")[0]}</h1>
        <p className="truncate text-sm text-muted">{user.email}</p>
      </div>
      <form action={signOutAction}>
        <button type="submit" className="flex min-h-10 items-center gap-2 rounded-full border border-line px-4 text-sm font-semibold">
          <LogOut className="size-4" aria-hidden /> <span className="max-[359px]:sr-only">Salir</span>
        </button>
      </form>
    </div>
  );
}
