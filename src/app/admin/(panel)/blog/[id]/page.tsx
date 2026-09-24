import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AdminPage } from "@/components/admin/ui";
import { getDb } from "@/server/db/client";
import { getPostAdmin, listPostCategories } from "@/server/services/posts";
import { requireAdmin } from "../../../_lib/auth";
import { PostForm, type PostFormValues } from "../post-form";

export const instant = false;
export const metadata: Metadata = { title: "Artículo del blog" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Date → "2026-07-14" en hora de Lima, para <input type="date">. */
const toLimaDay = (d: Date) => new Date(d.getTime() - 5 * 60 * 60 * 1000).toISOString().slice(0, 10);

export default async function PostAdminPage({ params, searchParams }: PageProps<"/admin/blog/[id]">) {
  await requireAdmin();
  const { id } = await params;
  const created = (await searchParams).creado === "1";
  const db = getDb();
  const isNew = id === "nuevo";
  if (!isNew && !UUID.test(id)) notFound();
  const [post, categories] = await Promise.all([isNew ? null : getPostAdmin(db, id), listPostCategories(db)]);
  if (!isNew && !post) notFound();

  const values: PostFormValues = post
    ? {
        id: post.id,
        title: post.title,
        slug: post.slug,
        summary: post.summary ?? "",
        body: post.body,
        category: post.category ?? "",
        author: post.author ?? "",
        isPublished: post.isPublished,
        publishedAt: toLimaDay(post.publishedAt),
        metaTitle: post.metaTitle ?? "",
        metaDescription: post.metaDescription ?? "",
        image: post.image,
      }
    : {
        id: null,
        title: "",
        slug: "",
        summary: "",
        body: "",
        category: "",
        author: "TWENTY",
        isPublished: false,
        publishedAt: "",
        metaTitle: "",
        metaDescription: "",
        image: null,
      };

  return (
    <AdminPage title={post ? "Editar artículo" : "Nuevo artículo"} back={{ href: "/admin/blog", label: "Blog" }}>
      <PostForm post={values} categories={categories} created={created} />
    </AdminPage>
  );
}
