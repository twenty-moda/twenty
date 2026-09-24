/** Blog: lectura para la tienda y edición desde el admin. */
import { and, asc, desc, eq, lte, ne } from "drizzle-orm";
import { z } from "zod";
import { excerpt, readingMinutes } from "@/lib/rich-text";
import { slugify } from "@/lib/slug";
import type { Db } from "../db/client";
import { posts } from "../db/schema";

export type PostCard = {
  slug: string;
  title: string;
  summary: string;
  image: string | null;
  category: string | null;
  publishedAt: Date;
  readingMinutes: number;
};

const published = (now: Date) => and(eq(posts.isPublished, true), lte(posts.publishedAt, now));

/** Artículos publicados, del más reciente al más antiguo. */
export async function listPublishedPosts(db: Db, now = new Date()): Promise<PostCard[]> {
  const rows = await db.select().from(posts).where(published(now)).orderBy(desc(posts.publishedAt), asc(posts.title));
  return rows.map((p) => ({
    slug: p.slug,
    title: p.title,
    summary: p.summary || excerpt(p.body, 200),
    image: p.image,
    category: p.category,
    publishedAt: p.publishedAt,
    readingMinutes: readingMinutes(p.body),
  }));
}

export async function getPublishedPost(db: Db, slug: string, now = new Date()) {
  const [post] = await db
    .select()
    .from(posts)
    .where(and(eq(posts.slug, slug), published(now)))
    .limit(1);
  if (!post) return null;
  return { ...post, summary: post.summary || excerpt(post.body, 200), readingMinutes: readingMinutes(post.body) };
}

// ─── Admin ───────────────────────────────────────────────────────────────────

export async function listPostsAdmin(db: Db) {
  return db
    .select({
      id: posts.id,
      slug: posts.slug,
      title: posts.title,
      image: posts.image,
      category: posts.category,
      isPublished: posts.isPublished,
      publishedAt: posts.publishedAt,
    })
    .from(posts)
    .orderBy(desc(posts.publishedAt));
}

export async function getPostAdmin(db: Db, id: string) {
  const [post] = await db.select().from(posts).where(eq(posts.id, id)).limit(1);
  return post ?? null;
}

export async function listPostCategories(db: Db): Promise<string[]> {
  const rows = await db.selectDistinct({ category: posts.category }).from(posts).orderBy(asc(posts.category));
  return rows.map((r) => r.category).filter((c): c is string => !!c);
}

const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((v) => v || null);

export const postInputSchema = z.object({
  title: z.string().trim().min(5, "Escribe un título").max(160),
  slug: z
    .string()
    .trim()
    .max(120)
    .nullable()
    .transform((v) => (v ? slugify(v) : null)),
  summary: optional(300),
  body: z.string().trim().min(20, "Escribe el artículo"),
  category: optional(60),
  author: optional(80),
  isPublished: z.boolean(),
  publishedAt: z.date({ error: "Revisa la fecha" }),
  metaTitle: optional(70),
  metaDescription: optional(170),
  image: z.string().nullable(),
});
export type PostInput = z.infer<typeof postInputSchema>;

export type SavePostResult = { ok: true; id: string; slug: string; previousSlug: string | null } | { ok: false; field?: string; message: string };

export async function savePost(db: Db, id: string | null, input: PostInput): Promise<SavePostResult> {
  const slug = input.slug || slugify(input.title);
  if (!slug) return { ok: false, field: "slug", message: "La URL no puede quedar vacía" };
  const [taken] = await db
    .select({ id: posts.id })
    .from(posts)
    .where(id ? and(eq(posts.slug, slug), ne(posts.id, id)) : eq(posts.slug, slug))
    .limit(1);
  if (taken) return { ok: false, field: "slug", message: "Ya hay otro artículo con esa URL" };

  const { image, ...rest } = input;
  if (id) {
    const [current] = await db.select({ slug: posts.slug }).from(posts).where(eq(posts.id, id)).limit(1);
    if (!current) return { ok: false, message: "El artículo ya no existe" };
    await db
      .update(posts)
      .set({ ...rest, slug, ...(image ? { image } : {}) })
      .where(eq(posts.id, id));
    return { ok: true, id, slug, previousSlug: current.slug === slug ? null : current.slug };
  }
  const [row] = await db
    .insert(posts)
    .values({ ...rest, slug, image })
    .returning({ id: posts.id });
  return { ok: true, id: row.id, slug, previousSlug: null };
}

export async function deletePost(db: Db, id: string) {
  const [row] = await db.delete(posts).where(eq(posts.id, id)).returning({ slug: posts.slug });
  return row?.slug ?? null;
}
