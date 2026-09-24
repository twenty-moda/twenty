"use client";

import { slugify } from "@/lib/slug";
import { useUrlSearch } from "@/lib/use-url-search";
import type { PostCard as PostCardData } from "@/server/services/posts";
import { Chip } from "../catalog/chip";
import { PostCard } from "./post-card";

/** Lista del blog con filtro por categoría (?categoria=…), sin salir del HTML estático. */
export function BlogBrowser({ posts }: { posts: PostCardData[] }) {
  const [search, setSearch] = useUrlSearch();
  const selected = new URLSearchParams(search).get("categoria");
  const categories = [...new Map(posts.filter((p) => p.category).map((p) => [slugify(p.category!), p.category!])).entries()];
  const visible = selected ? posts.filter((p) => p.category && slugify(p.category) === selected) : posts;
  const [featured, ...rest] = visible;

  const choose = (slug: string | null) => {
    const params = new URLSearchParams(search);
    if (slug) params.set("categoria", slug);
    else params.delete("categoria");
    setSearch(params.toString());
  };

  return (
    <div className="mx-auto max-w-6xl px-4">
      {categories.length > 1 ? (
        <div role="group" aria-label="Categorías del blog" className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-6 md:justify-center">
          <Chip active={!selected} onClick={() => choose(null)}>
            Todos
          </Chip>
          {categories.map(([slug, name]) => (
            <Chip key={slug} active={selected === slug} onClick={() => choose(slug)}>
              {name}
            </Chip>
          ))}
        </div>
      ) : null}

      {featured ? (
        <>
          <PostCard post={featured} featured eager />
          {rest.length ? (
            <div className="mt-10 grid grid-cols-1 gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
              {rest.map((post) => (
                <PostCard key={post.slug} post={post} />
              ))}
            </div>
          ) : null}
        </>
      ) : (
        <p className="py-16 text-center text-muted">Todavía no hay artículos en esta categoría.</p>
      )}
    </div>
  );
}
