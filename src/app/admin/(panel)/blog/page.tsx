import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { AdminPage, Badge, buttonClass, EmptyState, formatDay } from "@/components/admin/ui";
import { getDb } from "@/server/db/client";
import { listPostsAdmin } from "@/server/services/posts";
import { requireAdmin } from "../../_lib/auth";

export const instant = false;
export const metadata: Metadata = { title: "Blog" };

export default async function BlogAdminPage() {
  await requireAdmin();
  const posts = await listPostsAdmin(getDb());
  return (
    <AdminPage
      title="Blog"
      description="Artículos de /blogs. Ayudan a que Google encuentre la tienda."
      actions={
        <Link href="/admin/blog/nuevo" className={buttonClass("primary")}>
          <Plus className="size-4" aria-hidden /> Nuevo artículo
        </Link>
      }
    >
      {posts.length === 0 ? (
        <EmptyState title="Aún no hay artículos">Escribe el primero con “Nuevo artículo”.</EmptyState>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line">
          {posts.map((p) => (
            <li key={p.id}>
              <Link href={`/admin/blog/${p.id}`} className="flex items-center gap-4 px-4 py-3 hover:bg-surface">
                <span className="relative size-14 shrink-0 overflow-hidden rounded-lg bg-raised">
                  {p.image ? <Image src={p.image} alt="" fill sizes="56px" className="object-cover" /> : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 font-medium">{p.title}</span>
                  <span className="block truncate text-xs text-muted">
                    {formatDay(p.publishedAt)}
                    {p.category ? ` · ${p.category}` : ""}
                  </span>
                </span>
                {p.isPublished ? <Badge tone="success">Publicado</Badge> : <Badge>Borrador</Badge>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </AdminPage>
  );
}
