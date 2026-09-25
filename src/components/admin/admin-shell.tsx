"use client";

import {
  BookOpenText,
  Boxes,
  ExternalLink,
  FileSpreadsheet,
  FolderTree,
  Inbox,
  LayoutDashboard,
  LayoutTemplate,
  LogOut,
  Menu,
  Newspaper,
  Shirt,
  ShoppingBag,
  Tag,
  Truck,
  UserCog,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Logo } from "../store/logo";
import { Sheet } from "../ui/sheet";

type Badge = "orders" | "messages" | "complaints";
type NavItem = { href: string; label: string; icon: typeof LayoutDashboard; badge?: Badge };

const NAV_GROUPS: { title?: string; items: NavItem[] }[] = [
  { items: [{ href: "/admin", label: "Resumen", icon: LayoutDashboard }] },
  {
    title: "Ventas",
    items: [
      { href: "/admin/pedidos", label: "Pedidos", icon: ShoppingBag, badge: "orders" },
      { href: "/admin/clientes", label: "Clientes", icon: Users },
      { href: "/admin/mensajes", label: "Mensajes", icon: Inbox, badge: "messages" },
      { href: "/admin/reclamos", label: "Libro de Reclamaciones", icon: BookOpenText, badge: "complaints" },
    ],
  },
  {
    title: "Catálogo",
    items: [
      { href: "/admin/productos", label: "Productos", icon: Shirt },
      { href: "/admin/inventario", label: "Stock y precios", icon: Boxes },
      { href: "/admin/importar", label: "Carga masiva", icon: FileSpreadsheet },
      { href: "/admin/promociones", label: "Promociones", icon: Tag },
      { href: "/admin/categorias", label: "Categorías", icon: FolderTree },
    ],
  },
  {
    title: "Web",
    items: [
      { href: "/admin/blog", label: "Blog", icon: Newspaper },
      { href: "/admin/contenido", label: "Contenido de la web", icon: LayoutTemplate },
      { href: "/admin/envios", label: "Envíos", icon: Truck },
    ],
  },
  {
    title: "Ajustes",
    items: [{ href: "/admin/equipo", label: "Equipo", icon: UserCog }],
  },
];
const NAV = NAV_GROUPS.flatMap((g) => g.items);

type AdminShellProps = {
  user: { name: string; email: string };
  openOrders: number;
  /** Pendientes por sección (se muestran como número en el menú). */
  badges: Record<Badge, number>;
  logout: () => Promise<void>;
  children: ReactNode;
};

export function AdminShell({ user, openOrders, badges, logout, children }: AdminShellProps) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const current = NAV.find((n) => (n.href === "/admin" ? pathname === "/admin" : pathname.startsWith(n.href)));

  const nav = (onNavigate?: () => void) => (
    <nav aria-label="Panel" className="flex flex-1 flex-col">
      <div className="space-y-4 px-3">
        {NAV_GROUPS.map((group, gi) => (
          <div key={group.title ?? gi}>
            {group.title ? <p className="mb-1 px-3 text-[11px] font-semibold tracking-widest text-subtle uppercase">{group.title}</p> : null}
            <ul className="space-y-1">
              {group.items.map((item) => {
                const active = item === current;
                const Icon = item.icon;
                const count = item.badge ? badges[item.badge] : 0;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex h-11 items-center gap-3 rounded-xl px-3 text-sm transition",
                        active ? "bg-white font-semibold text-black" : "text-muted hover:bg-raised hover:text-white",
                      )}
                    >
                      <Icon className="size-[18px] shrink-0" aria-hidden />
                      <span className="flex-1">{item.label}</span>
                      {count > 0 ? (
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-xs font-bold tabular-nums",
                            active ? "bg-black text-white" : item.badge === "complaints" ? "bg-danger text-white" : "bg-warning text-black",
                          )}
                        >
                          {count}
                        </span>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
      <div className="mt-auto space-y-1 border-t border-line px-3 pt-3 pb-4">
        <a href="/" target="_blank" rel="noopener noreferrer" className="flex h-11 items-center gap-3 rounded-xl px-3 text-sm text-muted hover:bg-raised hover:text-white">
          <ExternalLink className="size-[18px]" aria-hidden /> Ver la tienda
        </a>
        <form action={logout}>
          <button type="submit" className="flex h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm text-muted hover:bg-raised hover:text-white">
            <LogOut className="size-[18px]" aria-hidden />
            <span className="min-w-0 flex-1">
              Salir <span className="block truncate text-xs text-subtle">{user.email}</span>
            </span>
          </button>
        </form>
      </div>
    </nav>
  );

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[256px_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-dvh flex-col overflow-y-auto border-r border-line bg-surface pt-5 lg:flex">
        <Link href="/admin" className="mb-6 px-6">
          <Logo className="w-28" />
        </Link>
        {nav()}
      </aside>

      <header className="sticky top-0 z-40 flex h-14 items-center gap-2 border-b border-line bg-ink/90 px-1 backdrop-blur-md lg:hidden">
        <button type="button" onClick={() => setMenuOpen(true)} aria-label="Abrir menú" className="grid size-12 place-items-center">
          <Menu className="size-6" aria-hidden />
        </button>
        <span className="flex-1 truncate text-sm font-semibold">{current?.label ?? "Admin"}</span>
        {openOrders > 0 ? (
          <Link href="/admin/pedidos?estado=abiertos" className="mr-2 inline-flex h-9 shrink-0 items-center rounded-full bg-warning px-3 text-xs font-bold text-black">
            {openOrders} por atender
          </Link>
        ) : null}
      </header>
      <Sheet open={menuOpen} onClose={() => setMenuOpen(false)} side="left" title="TWENTY Admin">
        <div className="flex min-h-full flex-col pt-3">{nav(() => setMenuOpen(false))}</div>
      </Sheet>

      <main className="min-w-0">{children}</main>
    </div>
  );
}
