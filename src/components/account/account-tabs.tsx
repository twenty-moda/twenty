"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

const TABS = [
  { href: "/cuenta", label: "Mis pedidos" },
  { href: "/cuenta/direcciones", label: "Direcciones" },
  { href: "/cuenta/datos", label: "Mis datos" },
];

export function AccountTabs() {
  const pathname = usePathname();
  return (
    <nav aria-label="Mi cuenta" className="mt-6 flex rounded-xl border border-line bg-raised p-1">
      {TABS.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn("flex min-h-10 flex-1 items-center justify-center rounded-lg px-1 text-center text-[13px] font-semibold transition min-[360px]:text-sm", active ? "bg-white text-black" : "text-muted")}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
