import type { Metadata, Viewport } from "next";
import { Libre_Franklin } from "next/font/google";
import { siteUrl } from "@/lib/links";
import "./globals.css";

const libreFranklin = Libre_Franklin({
  subsets: ["latin"],
  variable: "--font-libre-franklin",
  display: "swap",
});

const description =
  "Moda urbana joven diseñada para el día a día: baggy jeans, polos, hoodies y más. Envío en 24 a 48 horas en Lima y a todo el Perú.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: { default: "TWENTY | Moda urbana juvenil", template: "%s | TWENTY" },
  description,
  applicationName: "TWENTY",
  openGraph: { siteName: "TWENTY", locale: "es_PE", type: "website", description },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  themeColor: "#000000",
  colorScheme: "dark",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    // suppressHydrationWarning: la pantalla de carga marca data-splash y --splash-progress en <html> antes de hidratar.
    <html lang="es-PE" className={libreFranklin.variable} suppressHydrationWarning>
      <body className="min-h-dvh font-sans">{children}</body>
    </html>
  );
}
