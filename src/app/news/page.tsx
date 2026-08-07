import Link from "next/link";
import Header from "@/components/site/Header";
import Footer from "@/components/site/Footer";
import { createClient } from "@/lib/supabase/server";
import { categoryTagClass, postThumbnail, type Post } from "@/lib/posts";
import { formatKst } from "@/lib/format";

export default async function NewsListPage() {
  const supabase = await createClient();
  const { data: posts } = await supabase
    .from("posts")
    .select("*")
    .eq("is_published", true)
    .order("published_at", { ascending: false });

  const items = (posts ?? []) as Post[];

  return (
    <>
      <Header />
      <main>
        <section className="band-light">
          <div className="wrap">
            <div className="section-head">
              <div className="eyebrow">BLOG &amp; NEWS</div>
              <h2>오샘의 소식과 요양 정보</h2>
              <p>센터의 새로운 소식과 어르신 건강·복지 정보를 모아봅니다.</p>
            </div>

            {items.length === 0 ? (
              <div className="empty-note">아직 등록된 글이 없습니다.</div>
            ) : (
              <div className="news-grid">
                {items.map((post) => (
                  <Link
                    className="news-card"
                    key={post.id}
                    href={`/news/${post.id}`}
                    style={{ display: "block" }}
                  >
                    <div className="news-thumb">
                      <img src={postThumbnail(post)} alt={post.title} />
                    </div>
                    <div className="news-body">
                      <div className="news-meta">
                        <span className={`news-tag ${categoryTagClass(post.category)}`}>
                          {post.category}
                        </span>
                        <span className="news-date">
                          {formatKst(post.published_at).slice(0, 10)}
                        </span>
                      </div>
                      <h3>{post.title}</h3>
                      {post.excerpt && <p>{post.excerpt}</p>}
                      <div className="news-foot">
                        <span>
                          {post.read_minutes ? `⏱ ${post.read_minutes}분` : ""}
                        </span>
                        <span className="read">더 읽기 →</span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
