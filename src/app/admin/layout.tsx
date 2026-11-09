import type { Metadata } from "next";

// El admin lee la sesión en cada request: no hay HTML estático que validar ni navegación instantánea que exigir.
export const instant = false;

export const metadata: Metadata = {
  title: { default: "Admin", template: "%s · Admin TWENTY" },
  robots: { index: false, follow: false },
  // App aparte de la tienda («TWENTY Panel», ícono blanco): abre en /admin, que a un vendedor lo lleva a Vender.
  manifest: "/panel.webmanifest",
  appleWebApp: { capable: true, title: "TWENTY Panel", statusBarStyle: "black" },
  icons: { apple: "/icons/panel-apple-180.png" },
};

export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return children;
}
