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

  const { data: allPosts } = await supabase
    .from("posts")
    .select("id, title, published_at")
    .eq("is_published", true)
    .order("published_at", { ascending: true });

  const ordered = allPosts ?? [];
  const currentIndex = ordered.findIndex((item) => item.id === p.id);
  const prevPost = currentIndex > 0 ? ordered[currentIndex - 1] : null;
  const nextPost =
    currentIndex >= 0 && currentIndex < ordered.length - 1
      ? ordered[currentIndex + 1]
      : null;

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

            <div className="article-cta">
              <div className="article-cta-text">
                <p className="q">이 글이 도움이 되셨나요?</p>
                <p className="a">오샘재가복지센터에서 무료 상담을 받아보세요.</p>
              </div>
              <div className="article-cta-actions">
                <Link className="btn-primary" href="/#contact">
                  💬 무료 상담 신청
                </Link>
                <a className="btn-ghost" href="tel:051-637-7355">
                  📞 051-637-7355
                </a>
              </div>
            </div>

            <div className="article-nav">
              {prevPost ? (
                <Link href={`/news/${prevPost.id}`}>
                  <span className="lbl">← 이전 글</span>
                  {prevPost.title}
                </Link>
              ) : (
                <span />
              )}
              {nextPost && (
                <Link className="next" href={`/news/${nextPost.id}`}>
                  <span className="lbl">다음 글 →</span>
                  {nextPost.title}
                </Link>
              )}
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
