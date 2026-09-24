"use server";

import { refresh, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { cacheTags } from "@/lib/cache-tags";
import { getDb } from "@/server/db/client";
import {
  addProductImage,
  deleteProduct,
  deleteProductImage,
  getImageProduct,
  getProductSlug,
  moveProductImage,
  productInputSchema,
  saveProduct,
  saveVariants,
  updateProductImage,
  variantInputSchema,
} from "@/server/services/admin-products";
import { InvalidImageError, saveImage } from "@/server/storage";
import { requireAdmin } from "../../_lib/auth";
import { failure, form, success, zodFailure, type ActionState } from "../../_lib/action-state";

/** La tienda muestra el cambio al instante: ficha del producto + listados del catálogo. */
function refreshStore(...slugs: (string | null | undefined)[]) {
  for (const slug of slugs) if (slug) updateTag(cacheTags.product(slug));
  updateTag(cacheTags.catalog);
}

export async function saveProductAction(productId: string | null, _: ActionState, fd: FormData): Promise<ActionState> {
  await requireAdmin();
  const parsed = productInputSchema.safeParse({
    name: form.text(fd, "name"),
    slug: form.text(fd, "slug") || undefined,
    categoryId: form.text(fd, "categoryId"),
    fitId: form.optional(fd, "fitId"),
    description: form.optional(fd, "description"),
    sizeGuide: form.optional(fd, "sizeGuide"),
    status: form.text(fd, "status"),
    isFeatured: form.bool(fd, "isFeatured"),
    metaTitle: form.optional(fd, "metaTitle"),
    metaDescription: form.optional(fd, "metaDescription"),
  });
  if (!parsed.success) return zodFailure(parsed.error);

  const result = await saveProduct(getDb(), productId, parsed.data);
  if (!result.ok) return failure(result.message, { slug: result.message });
  refreshStore(result.slug, result.previousSlug);
  if (!productId) redirect(`/admin/productos/${result.id}?nuevo=1`);
  refresh();
  return success(result.previousSlug ? `Guardado. La dirección anterior /product/${result.previousSlug} redirige a la nueva.` : "Producto guardado.");
}

export async function saveVariantsAction(productId: string, variants: unknown): Promise<ActionState> {
  await requireAdmin();
  const parsed = z.array(variantInputSchema).max(200).safeParse(variants);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const row = typeof issue.path[0] === "number" ? `Fila ${issue.path[0] + 1}: ` : "";
    return failure(`${row}${issue.message}`);
  }
  const db = getDb();
  const result = await saveVariants(db, productId, parsed.data);
  if (!result.ok) return failure(result.message);
  refreshStore(await getProductSlug(db, productId));
  refresh();
  return success("Variantes guardadas.");
}

export async function uploadProductPhotoAction(productId: string, colorId: string | null, fd: FormData): Promise<ActionState> {
  await requireAdmin();
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return failure("No llegó la foto.");
  if (file.size > 8 * 1024 * 1024) return failure("La foto pesa más de 8 MB.");
  const db = getDb();
  const slug = await getProductSlug(db, productId);
  if (!slug) return failure("El producto no existe.");
  try {
    const path = await saveImage(await file.arrayBuffer(), "item", `${slug}-${crypto.randomUUID().slice(0, 8)}`);
    await addProductImage(db, { productId, colorId, path });
  } catch (error) {
    if (error instanceof InvalidImageError) return failure(error.message);
    throw error;
  }
  refreshStore(slug);
  refresh();
  return success("Foto subida.");
}

async function afterImageChange(imageId: string, change: () => Promise<void>) {
  await requireAdmin();
  const db = getDb();
  const owner = await getImageProduct(db, imageId);
  await change();
  if (owner) refreshStore(owner.slug);
  refresh();
}

export async function setPhotoColorAction(imageId: string, colorId: string | null) {
  await afterImageChange(imageId, () => updateProductImage(getDb(), imageId, { colorId }));
}

export async function movePhotoAction(imageId: string, direction: -1 | 1) {
  await afterImageChange(imageId, () => moveProductImage(getDb(), imageId, direction));
}

export async function deletePhotoAction(imageId: string) {
  await afterImageChange(imageId, () => deleteProductImage(getDb(), imageId));
}

export async function deleteProductAction(productId: string) {
  await requireAdmin();
  const result = await deleteProduct(getDb(), productId);
  if (result.ok) refreshStore(result.slug);
  redirect("/admin/productos");
}
