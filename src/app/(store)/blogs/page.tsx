import type { Metadata } from "next";
import { BlogBrowser } from "@/components/blog/blog-browser";
import { JsonLd } from "@/components/store/json-ld";
import { PageHeader } from "@/components/store/page-header";
import { siteUrl } from "@/lib/links";
import { getPosts } from "../_data";

const description = "Guías de estilo y de tallas, cómo cuidar tu ropa y lo último de la comunidad TWENTY.";

export const metadata: Metadata = {
  title: "Blog",
  description,
  alternates: { canonical: "/blogs" },
};

export default async function BlogPage() {
  const posts = await getPosts();
  return (
    <>
      <PageHeader eyebrow="Blog" title="Estilo, tallas y calle" description={description} />
      <BlogBrowser posts={posts} />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Blog",
          name: "Blog de TWENTY",
          url: `${siteUrl()}/blogs`,
          blogPost: posts.map((p) => ({ "@type": "BlogPosting", headline: p.title, url: `${siteUrl()}/post/${p.slug}`, datePublished: p.publishedAt.toISOString() })),
        }}
      />
    </>
  );
}
