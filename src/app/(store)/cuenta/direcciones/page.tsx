import type { Metadata } from "next";
import { Suspense } from "react";
import { AddressBook } from "@/components/account/address-book";
import { getDb } from "@/server/db/client";
import { listAddresses, MAX_ADDRESSES } from "@/server/services/accounts";
import { getCheckoutShipping } from "../../_data";
import { requireAccount } from "../../_lib/account";

export const metadata: Metadata = { title: "Mis direcciones", robots: { index: false } };

export default function AccountAddressesPage() {
  return (
    <Suspense fallback={<div className="h-40 animate-pulse rounded-2xl bg-raised" aria-busy="true" />}>
      <Addresses />
    </Suspense>
  );
}

async function Addresses() {
  const user = await requireAccount("/cuenta/direcciones");
  const [saved, { limaDistricts }] = await Promise.all([listAddresses(getDb(), user.id), getCheckoutShipping()]);
  return <AddressBook addresses={saved} limaDistricts={limaDistricts.map((d) => ({ ubigeo: d.ubigeo, name: d.name }))} max={MAX_ADDRESSES} />;
}
