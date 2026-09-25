import { Big_Shoulders, IBM_Plex_Mono } from "next/font/google";

/**
 * Fuentes de la portada (diseño urbano). Se cargan solo en el inicio: el resto de la tienda usa Libre Franklin.
 * Big Shoulders es variable con tamaño óptico: en titulares grandes el navegador usa su corte "display" solo.
 */
export const displayFont = Big_Shoulders({
  subsets: ["latin"],
  axes: ["opsz"],
  variable: "--font-big-shoulders",
  display: "swap",
  // next/font no trae medidas de respaldo para esta familia: se declara el respaldo a mano.
  adjustFontFallback: false,
  fallback: ["Impact", "Arial Narrow", "sans-serif"],
});
export const monoFont = IBM_Plex_Mono({ subsets: ["latin"], weight: ["500", "600"], variable: "--font-plex-mono", display: "swap" });
