/**
 * Medidas recomendadas de cada foto que se sube en el admin, según cómo se muestra en la tienda.
 * El formato no importa: se acepta JPG, PNG o WebP y el servidor la convierte a WebP (máx. 1600 px, ver storage.ts).
 */
export type ImageSpec = {
  width: number;
  height: number;
  /** "vertical 3:4", "cuadrada"… */
  shape: string;
  /** Qué se recorta o dónde poner lo importante. */
  note?: string;
};

export const IMAGE_SPECS = {
  product: { width: 1200, height: 1600, shape: "vertical 3:4" },
  bannerDesktop: { width: 1200, height: 1200, shape: "cuadrada", note: "Deja el texto lejos de los bordes." },
  bannerMobile: { width: 1080, height: 1080, shape: "cuadrada", note: "Deja el texto lejos de los bordes." },
  category: { width: 900, height: 1200, shape: "vertical 3:4" },
  post: { width: 1600, height: 1200, shape: "horizontal 4:3", note: "En la lista se ve cuadrada: lo importante al centro." },
  about: { width: 1600, height: 1200, shape: "horizontal 4:3", note: "En computadora se recorta arriba y abajo." },
  qr: { width: 800, height: 800, shape: "cuadrada" },
} satisfies Record<string, ImageSpec>;

export const FORMAT_HINT = "JPG, PNG o WebP: se convierte sola a WebP.";

export const specLabel = (spec: ImageSpec) => `${spec.width} × ${spec.height} px (${spec.shape})`;

/**
 * Avisos para una foto ya elegida: si es chica (se verá borrosa) o tiene otra forma (se recorta).
 * No bloquean la subida: la foto se sube igual.
 */
export function imageWarnings(size: { width: number; height: number }, spec: ImageSpec): string[] {
  const warnings: string[] = [];
  const measured = `${size.width} × ${size.height} px`;
  // Con 75 % del ancho ideal todavía se ve bien en la mayoría de pantallas.
  if (size.width < spec.width * 0.75 || size.height < spec.height * 0.75) {
    warnings.push(`Mide ${measured}: puede verse borrosa. Lo ideal es ${spec.width} × ${spec.height} px.`);
  }
  const ratio = size.width / size.height;
  const target = spec.width / spec.height;
  if (Math.abs(ratio - target) / target > 0.08) {
    warnings.push(`No es ${spec.shape}: en la tienda se recortará ${ratio > target ? "a los costados" : "arriba y abajo"}.`);
  }
  return warnings;
}
