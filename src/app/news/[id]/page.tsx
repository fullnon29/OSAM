import Link from "next/link";
import { notFound } from "next/navigation";
import Header from "@/components/site/Header";
import Footer from "@/components/site/Footer";
import { createClient } from "@/lib/supabase/server";
import { categoryTagClass, postThumbnail, type Post } from "@/lib/posts";
import { formatKst } from "@/lib/format";

export default async function NewsDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: post } = await supabase
    .from("posts")
    .select("*")
    .eq("id", id)
    .eq("is_published", true)
    .maybeSingle();

  if (!post) notFound();
  const p = post as Post;

  return (
    <>
      <Header />
      <main>
        <section className="band-light">
          <div className="wrap" style={{ maxWidth: 760 }}>
            <Link className="btn-ghost" href="/news" style={{ marginBottom: 24, display: "inline-flex" }}>
              ← 목록으로
            </Link>
            <div
              style={{
                aspectRatio: "16/9",
                borderRadius: 20,
                overflow: "hidden",
                margin: "20px 0",
              }}
            >
              <img
                src={postThumbnail(p)}
                alt={p.title}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            </div>
            <div className="news-meta">
              <span className={`news-tag ${categoryTagClass(p.category)}`}>
                {p.category}
              </span>
              <span className="news-date">
                {formatKst(p.published_at).slice(0, 10)}
                {p.read_minutes ? ` · ⏱ ${p.read_minutes}분` : ""}
              </span>
            </div>
            <h1
              className="serif"
              style={{
                fontSize: 30,
                color: "var(--pine-deep)",
                margin: "14px 0 28px",
                lineHeight: 1.4,
              }}
            >
              {p.title}
            </h1>
            <div
              style={{
                fontSize: 15.5,
                lineHeight: 1.9,
                color: "var(--ink)",
                whiteSpace: "pre-wrap",
              }}
            >
              {p.content}
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
