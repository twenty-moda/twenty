"use server";

import { refresh, updateTag } from "next/cache";
import { readSheet } from "read-excel-file/node";
import { cacheTags } from "@/lib/cache-tags";
import { parsePhotoName, parseProductSheet, type ParsedSheet } from "@/lib/product-import";
import { getDb } from "@/server/db/client";
import { applyImport, attachPhoto, findVariantForPhoto, planImport, type ImportPlan } from "@/server/services/product-import";
import { InvalidImageError, saveImage } from "@/server/storage";
import { requireAdmin } from "../../_lib/auth";

export type ImportState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "preview"; plan: ImportPlan; fileName: string }
  | { status: "done"; plan: ImportPlan };

async function readUpload(fd: FormData): Promise<{ parsed: ParsedSheet; name: string } | { error: string }> {
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Elige el archivo de Excel (.xlsx)." };
  if (!/\.xlsx$/i.test(file.name)) return { error: "El archivo debe ser .xlsx (en Excel: Guardar como → Libro de Excel)." };
  if (file.size > 5 * 1024 * 1024) return { error: "El archivo pesa más de 5 MB." };
  try {
    const sheet = await readSheet(Buffer.from(await file.arrayBuffer()));
    return { parsed: parseProductSheet(sheet), name: file.name };
  } catch {
    return { error: "No se pudo leer el Excel. Revisa que sea la plantilla y que no esté protegido con contraseña." };
  }
}

export async function previewImportAction(_: ImportState, fd: FormData): Promise<ImportState> {
  await requireAdmin();
  const upload = await readUpload(fd);
  if ("error" in upload) return { status: "error", message: upload.error };
  if (upload.parsed.rows.length === 0 && upload.parsed.issues.length === 0) return { status: "error", message: "La hoja no tiene filas de productos." };
  return { status: "preview", plan: await planImport(getDb(), upload.parsed), fileName: upload.name };
}

export async function applyImportAction(_: ImportState, fd: FormData): Promise<ImportState> {
  await requireAdmin();
  const upload = await readUpload(fd);
  if ("error" in upload) return { status: "error", message: upload.error };
  const { plan, productSlugs } = await applyImport(getDb(), upload.parsed);
  for (const slug of productSlugs) updateTag(cacheTags.product(slug));
  updateTag(cacheTags.catalog);
  refresh();
  return { status: "done", plan };
}

export type PhotoResult = { ok: true; message: string } | { ok: false; message: string };

/** Una foto nombrada con el SKU (TMW-0001.jpg, TMW-0001_02.jpg) se guarda y se asigna a su producto y color. */
export async function uploadSkuPhotoAction(fd: FormData): Promise<PhotoResult> {
  await requireAdmin();
  const file = fd.get("file");
  const originalName = String(fd.get("name") ?? "");
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: "No llegó la foto." };
  const parsed = parsePhotoName(originalName || file.name);
  if (!parsed) return { ok: false, message: "El nombre no empieza con un SKU (ej. TMW-0001.jpg)." };
  const db = getDb();
  const target = await findVariantForPhoto(db, parsed.sku);
  if (!target) return { ok: false, message: `No hay ninguna prenda con el SKU ${parsed.sku}.` };
  try {
    const base = parsed.position ? `${parsed.sku}_${String(parsed.position).padStart(2, "0")}` : parsed.sku;
    // Nombre nuevo en cada subida (el CDN guarda las fotos un año); attachPhoto reemplaza la versión anterior.
    const path = await saveImage(await file.arrayBuffer(), "item", `${base}-${crypto.randomUUID().slice(0, 8)}`);
    await attachPhoto(db, target, path, parsed.position, base);
  } catch (error) {
    if (error instanceof InvalidImageError) return { ok: false, message: error.message };
    throw error;
  }
  updateTag(cacheTags.product(target.productSlug));
  updateTag(cacheTags.catalog);
  return { ok: true, message: `${target.productName} · ${target.colorName}` };
}
