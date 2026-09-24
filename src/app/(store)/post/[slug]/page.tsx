import { ArrowLeft, MessageCircle } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense, ViewTransition } from "react";
import { PostCard, PostMeta, postMorphName } from "@/components/blog/post-card";
import { CopyLinkButton } from "@/components/checkout/copy-link-button";
import { JsonLd } from "@/components/store/json-ld";
import { ProductRail } from "@/components/store/product-rail";
import { RichText } from "@/components/ui/rich-text";
import { absoluteMediaUrl, siteUrl } from "@/lib/links";
import { slugify } from "@/lib/slug";
import { getPost, getPosts, getProductCards } from "../../_data";

export async function generateStaticParams() {
  const posts = await getPosts();
  return posts.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: PageProps<"/post/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) return { title: "Artículo no encontrado", robots: { index: false } };
  const description = post.metaDescription || post.summary;
  return {
    title: post.metaTitle || post.title,
    description,
    alternates: { canonical: `/post/${post.slug}` },
    openGraph: {
      type: "article",
      title: post.title,
      description,
      publishedTime: post.publishedAt.toISOString(),
      modifiedTime: post.updatedAt.toISOString(),
      images: post.image ? [{ url: absoluteMediaUrl(post.image) }] : [],
    },
  };
}

export default function PostPage({ params }: PageProps<"/post/[slug]">) {
  return (
    <Suspense fallback={<PostSkeleton />}>
      <PostContent params={params} />
    </Suspense>
  );
}

async function PostContent({ params }: Pick<PageProps<"/post/[slug]">, "params">) {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) notFound();

  const [posts, products] = await Promise.all([getPosts(), getProductCards()]);
  const related = [...posts.filter((p) => p.slug !== post.slug && p.category === post.category), ...posts.filter((p) => p.slug !== post.slug && p.category !== post.category)].slice(0, 3);
  const inStock = products.filter((p) => p.inStock);
  const picks = [...inStock.filter((p) => p.isFeatured), ...inStock.filter((p) => !p.isFeatured)].slice(0, 8);
  const url = `${siteUrl()}/post/${post.slug}`;

  return (
    <>
      <article className="mx-auto max-w-2xl px-4 pt-6">
        <Link href="/blogs" className="inline-flex h-10 items-center gap-2 text-sm font-semibold tracking-wide uppercase">
          <ArrowLeft className="size-4" aria-hidden /> Blog
        </Link>

        <header className="pt-4">
          {post.category ? (
            <Link
              href={`/blogs?categoria=${slugify(post.category)}`}
              className="inline-flex min-h-8 items-center rounded bg-white px-2.5 text-[11px] font-bold tracking-wide text-black uppercase"
            >
              {post.category}
            </Link>
          ) : null}
          <h1 className="mt-3 display-title font-extrabold tracking-tight text-balance uppercase">{post.title}</h1>
          <PostMeta post={post} className="mt-3" />
        </header>

        {post.image ? (
          <ViewTransition name={postMorphName(post.slug)} share="morph" default="none">
            <div className="relative mt-6 aspect-square overflow-hidden rounded-2xl bg-raised md:aspect-4/3">
              <Image src={post.image} alt="" fill priority sizes="(min-width: 672px) 672px, 100vw" className="object-cover" />
            </div>
          </ViewTransition>
        ) : null}

        <RichText source={post.body} className="mt-8 text-[17px]" />

        <div className="mt-10 flex flex-wrap items-center gap-3 border-t border-line pt-6">
          <span className="w-full text-sm text-muted sm:w-auto">Compártelo:</span>
          <a
            href={`https://wa.me/?text=${encodeURIComponent(`${post.title} ${url}`)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-11 items-center gap-2 rounded-full border border-line px-5 font-semibold"
          >
            <MessageCircle className="size-4" aria-hidden /> WhatsApp
          </a>
          <CopyLinkButton className="" />
        </div>
      </article>

      <ProductRail title="Arma tu look" products={picks} href="/catalogo" layout="rail" morph />

      {related.length ? (
        <section aria-labelledby="mas-articulos" className="mx-auto max-w-6xl px-4 py-6">
          <h2 id="mas-articulos" className="text-sm font-bold tracking-widest uppercase">
            Sigue leyendo
          </h2>
          <div className="mt-4 grid grid-cols-1 gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
            {related.map((p) => (
              <PostCard key={p.slug} post={p} />
            ))}
          </div>
        </section>
      ) : null}

      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "BlogPosting",
              headline: post.title,
              description: post.summary,
              image: post.image ? [absoluteMediaUrl(post.image)] : undefined,
              datePublished: post.publishedAt.toISOString(),
              dateModified: post.updatedAt.toISOString(),
              author: { "@type": "Organization", name: post.author || "TWENTY" },
              publisher: { "@type": "Organization", name: "TWENTY", logo: { "@type": "ImageObject", url: `${siteUrl()}/brand/twenty-logo.webp` } },
              mainEntityOfPage: url,
            },
            {
              "@type": "BreadcrumbList",
              itemListElement: [
                { "@type": "ListItem", position: 1, name: "Inicio", item: siteUrl() },
                { "@type": "ListItem", position: 2, name: "Blog", item: `${siteUrl()}/blogs` },
                { "@type": "ListItem", position: 3, name: post.title, item: url },
              ],
            },
          ],
        }}
      />
    </>
  );
}

function PostSkeleton() {
  return (
    <div className="mx-auto max-w-2xl animate-pulse space-y-4 px-4 pt-10" aria-busy="true" aria-label="Cargando artículo">
      <div className="h-4 w-20 rounded bg-raised" />
      <div className="h-10 w-full rounded bg-raised" />
      <div className="h-10 w-2/3 rounded bg-raised" />
      <div className="aspect-square rounded-2xl bg-raised" />
    </div>
  );
}
