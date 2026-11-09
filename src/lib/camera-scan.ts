/**
 * Lector de códigos con la cámara del teléfono o la tablet (pedido de TWENTY, 09/11/2026): lo que no depende del
 * navegador, para probarlo sin cámara. La vista está en `components/admin/camera-scanner.tsx`.
 */

/** Code 128 es el de nuestras etiquetas (`src/lib/barcode.ts`); QR y EAN-13 por si llega una etiqueta de otro lado. */
export const SCAN_FORMATS = ["code_128", "qr_code", "ean_13"] as const;

/**
 * El lector en WebAssembly (iPhone, iPad y los navegadores sin lector propio) se sirve desde la tienda y no desde un
 * CDN. El nombre lleva la versión: al actualizar `barcode-detector` hay que copiar el nuevo (lo avisa el test).
 */
export const zxingWasmPath = (version: string) => `/vendor/zxing_reader-${version}.wasm`;

/**
 * La cámara ve la misma etiqueta muchas veces por segundo: un código vuelve a contar solo si salió del cuadro al
 * menos `gapMs`. Así, para sumar dos iguales se aparta la cámara y se vuelve a apuntar (como apretar dos veces la
 * pistola). Devuelve el código que cuenta en esta lectura o null.
 */
export function createScanGate(gapMs = 1500) {
  const seen = new Map<string, number>();
  return (values: readonly string[], now: number): string | null => {
    let accepted: string | null = null;
    for (const raw of values) {
      const value = raw.trim();
      if (!value) continue;
      const last = seen.get(value);
      if (accepted === null && (last === undefined || now - last >= gapMs)) accepted = value;
      seen.set(value, now);
    }
    for (const [value, at] of seen) if (now - at >= gapMs) seen.delete(value);
    return accepted;
  };
}

/** Lo que le decimos al vendedor cuando la cámara no abre (el `name` del error de `getUserMedia`). */
export function cameraErrorMessage(error: unknown): string {
  const name = error instanceof Error || (typeof DOMException !== "undefined" && error instanceof DOMException) ? error.name : "";
  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      return "No hay permiso para usar la cámara. Toca el candado junto a la dirección de la página (o entra a los ajustes del navegador), permite la cámara y vuelve a intentar.";
    case "NotFoundError":
    case "OverconstrainedError":
      return "No encontramos una cámara en este equipo.";
    case "NotReadableError":
    case "AbortError":
      return "Otra app está usando la cámara. Ciérrala y vuelve a intentar.";
    case "CameraUnsupported":
      return "Este navegador no deja usar la cámara. Abre el panel en Chrome o Safari.";
    case "ReaderLoadError":
      return "No se pudo cargar el lector de códigos. Revisa la conexión y vuelve a intentar.";
    default:
      return "No se pudo abrir la cámara. Vuelve a intentar.";
  }
}
