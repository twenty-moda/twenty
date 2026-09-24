import type { Metadata } from "next";

// El admin lee la sesión en cada request: no hay HTML estático que validar ni navegación instantánea que exigir.
export const instant = false;

export const metadata: Metadata = {
  title: { default: "Admin", template: "%s · Admin TWENTY" },
  robots: { index: false, follow: false },
};

export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return children;
}
