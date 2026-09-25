/** Medidas reales de la foto (ya girada según el celular), o null si el navegador no puede leerla. */
export async function readImageSize(file: File): Promise<{ width: number; height: number } | null> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return size;
  } catch {
    return null;
  }
}

/**
 * Achica una foto en el navegador antes de subirla (máx. 1600 px, JPEG). Así las fotos del celular
 * suben rápido y no superan el límite de 4.5 MB por request de Vercel. El servidor la convierte a WebP.
 * Si el navegador no puede leer el formato, se sube el archivo original y el servidor decide.
 */
export async function resizeForUpload(file: File, max = 1600): Promise<File> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return file;
  }
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && file.size < 1_500_000) {
    bitmap.close();
    return file;
  }
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
  if (!blob) return file;
  // Se conserva el nombre (importa para la carga por SKU: TMW-0001_01.jpg).
  return new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg" });
}
