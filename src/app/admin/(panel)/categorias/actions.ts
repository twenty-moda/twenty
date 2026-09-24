"use server";

import { refresh, updateTag } from "next/cache";
import { cacheTags } from "@/lib/cache-tags";
import { getDb } from "@/server/db/client";
import { deleteTaxon, saveTaxon, setTaxonImage, taxonInputSchema } from "@/server/services/admin-products";
import { InvalidImageError, saveImage } from "@/server/storage";
import { requireAdmin } from "../../_lib/auth";
import { failure, form, success, zodFailure, type ActionState } from "../../_lib/action-state";

type Kind = "category" | "fit";

export async function saveTaxonAction(kind: Kind, id: string | null, _: ActionState, fd: FormData): Promise<ActionState> {
  await requireAdmin();
  const parsed = taxonInputSchema.safeParse({
    name: form.text(fd, "name"),
    isVisible: form.bool(fd, "isVisible"),
    position: form.int(fd, "position") ?? undefined,
  });
  if (!parsed.success) return zodFailure(parsed.error);
  const result = await saveTaxon(getDb(), kind, id, parsed.data);
  if (!result.ok) return failure(result.message);
  updateTag(cacheTags.catalog);
  refresh();
  return success(id ? "Guardado." : "Creado.");
}

export async function deleteTaxonAction(kind: Kind, id: string): Promise<ActionState> {
  await requireAdmin();
  const result = await deleteTaxon(getDb(), kind, id);
  if (!result.ok) return failure(result.message);
  updateTag(cacheTags.catalog);
  refresh();
  return success("Eliminado.");
}

export async function uploadTaxonImageAction(kind: Kind, id: string, fd: FormData): Promise<ActionState> {
  await requireAdmin();
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return failure("No llegó la imagen.");
  try {
    const path = await saveImage(await file.arrayBuffer(), kind === "category" ? "category" : "sub_category", `${kind}-${crypto.randomUUID().slice(0, 8)}`);
    await setTaxonImage(getDb(), kind, id, path);
  } catch (error) {
    if (error instanceof InvalidImageError) return failure(error.message);
    throw error;
  }
  updateTag(cacheTags.catalog);
  refresh();
  return success("Imagen actualizada.");
}
