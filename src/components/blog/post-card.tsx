import Image from "next/image";
import Link from "next/link";
import { ViewTransition } from "react";
import { cn } from "@/lib/cn";
import type { PostCard as PostCardData } from "@/server/services/posts";

const dateFormat = new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", day: "numeric", month: "long", year: "numeric" });
export const formatPostDate = (d: Date) => dateFormat.format(d);
/** Nombre compartido entre la foto de la tarjeta y la del artículo (la foto "vuela" al abrirlo). */
export const postMorphName = (slug: string) => `post-${slug}`;

export function PostMeta({ post, className }: { post: Pick<PostCardData, "publishedAt" | "readingMinutes">; className?: string }) {
  return (
    <p className={cn("text-xs text-muted", className)}>
      <time dateTime={post.publishedAt.toISOString()}>{formatPostDate(post.publishedAt)}</time> · {post.readingMinutes} min de lectura
    </p>
  );
}

/** Tarjeta de artículo. `featured` = la grande del inicio del blog. */
export function PostCard({ post, featured = false, eager = false }: { post: PostCardData; featured?: boolean; eager?: boolean }) {
  return (
    <article className={cn("group relative", !featured && "reveal")}>
      <Link href={`/post/${post.slug}`} prefetch className="block transition-transform duration-200 active:scale-[0.99]">
        <div className={cn("relative overflow-hidden rounded-2xl bg-raised", featured ? "aspect-4/5 md:aspect-video" : "aspect-square")}>
          {post.image ? (
            <ViewTransition name={postMorphName(post.slug)} share="morph" default="none">
              <div className="absolute inset-0 overflow-hidden rounded-2xl">
                <Image
                  src={post.image}
                  alt=""
                  fill
                  loading={eager ? "eager" : "lazy"}
                  fetchPriority={eager ? "high" : undefined}
                  sizes={featured ? "(min-width: 1024px) 1024px, 100vw" : "(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"}
                  className="object-cover transition duration-700 ease-out group-hover:scale-[1.03]"
                />
              </div>
            </ViewTransition>
          ) : null}
          {featured ? <div className="absolute inset-0 bg-linear-to-t from-black via-black/40 to-transparent" /> : null}
          {post.category ? (
            <span className="absolute top-3 left-3 rounded bg-white px-2 py-1 text-[11px] font-bold tracking-wide text-black uppercase">{post.category}</span>
          ) : null}
          {featured ? (
            <div className="absolute inset-x-0 bottom-0 p-5 md:p-8">
              <PostMeta post={post} className="text-white/70" />
              <h2 className="mt-2 line-clamp-3 text-2xl leading-tight font-extrabold text-balance uppercase md:text-4xl">{post.title}</h2>
              <p className="mt-2 line-clamp-2 text-sm text-white/80 md:max-w-2xl md:text-base">{post.summary}</p>
            </div>
          ) : null}
        </div>
        {!featured ? (
          <div className="pt-3">
            <PostMeta post={post} />
            <h3 className="mt-1.5 line-clamp-2 leading-snug font-bold uppercase">{post.title}</h3>
            <p className="mt-1 line-clamp-2 text-sm text-muted">{post.summary}</p>
          </div>
        ) : null}
      </Link>
    </article>
  );
}
