"use server";

import { refresh, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { cacheTags } from "@/lib/cache-tags";
import { getDb } from "@/server/db/client";
import { deletePost, postInputSchema, savePost } from "@/server/services/posts";
import { InvalidImageError, saveImage } from "@/server/storage";
import { requireAdmin } from "../../_lib/auth";
import { failure, form, success, zodFailure, type ActionState } from "../../_lib/action-state";

/** "2026-07-14" en hora de Lima (mediodía, así no cambia de día). */
const limaDay = (value: string) => (/^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00-05:00`) : null);

export async function savePostAction(id: string | null, _: ActionState, fd: FormData): Promise<ActionState> {
  await requireAdmin();
  let image: string | null = null;
  const file = fd.get("image");
  try {
    if (file instanceof File && file.size > 0) {
      image = await saveImage(await file.arrayBuffer(), "post", `${form.text(fd, "title").slice(0, 40) || "articulo"}-${crypto.randomUUID().slice(0, 8)}`);
    }
  } catch (error) {
    if (error instanceof InvalidImageError) return failure(error.message);
    throw error;
  }

  const parsed = postInputSchema.safeParse({
    title: form.text(fd, "title"),
    slug: form.optional(fd, "slug"),
    summary: form.optional(fd, "summary"),
    body: form.text(fd, "body"),
    category: form.optional(fd, "category"),
    author: form.optional(fd, "author"),
    isPublished: form.bool(fd, "isPublished"),
    // Sin fecha = hoy.
    publishedAt: form.text(fd, "publishedAt") ? limaDay(form.text(fd, "publishedAt")) : new Date(),
    metaTitle: form.optional(fd, "metaTitle"),
    metaDescription: form.optional(fd, "metaDescription"),
    image,
  });
  if (!parsed.success) return zodFailure(parsed.error);

  const result = await savePost(getDb(), id, parsed.data);
  if (!result.ok) return failure(result.message, result.field ? { [result.field]: result.message } : undefined);
  updateTag(cacheTags.blog);
  if (!id) redirect(`/admin/blog/${result.id}?creado=1`);
  refresh();
  return success(parsed.data.isPublished ? "Guardado. Ya se ve en el blog." : "Guardado como borrador (no se ve en la tienda).");
}

export async function deletePostAction(id: string) {
  await requireAdmin();
  await deletePost(getDb(), id);
  updateTag(cacheTags.blog);
  redirect("/admin/blog");
}
