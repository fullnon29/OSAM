import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchNhisArticles } from "@/lib/nhis-import";
import { fetchMohwArticles } from "@/lib/mohw-import";
import { fetchLtcArticles } from "@/lib/ltc-import";
import {
  capContent,
  estimateReadMinutes,
  MAX_PER_RUN,
  toIso,
  type NewsArticle,
} from "@/lib/news-common";

export const maxDuration = 60;

const SOURCES: { name: string; fetch: () => Promise<NewsArticle[]> }[] = [
  { name: "공단 보도자료", fetch: fetchNhisArticles },
  { name: "복지부 보도자료", fetch: fetchMohwArticles },
  { name: "장기요양 법령자료실", fetch: fetchLtcArticles },
];

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "인증되지 않은 요청입니다." }, { status: 401 });
  }

  // ?dry=1 로 부르면 글을 쓰지 않고 무엇이 들어올지만 돌려줍니다.
  // 수집하는 곳을 늘리거나 고친 뒤 눈으로 확인하는 용도입니다.
  const dry = new URL(request.url).searchParams.get("dry") === "1";

  const admin = createAdminClient();
  const errors: string[] = [];

  // 한 곳이 모양을 바꾸거나 멈춰도 나머지는 받아 오도록 따로따로 처리합니다.
  const gathered = await Promise.all(
    SOURCES.map(async (s) => {
      try {
        return await s.fetch();
      } catch (err) {
        errors.push(`${s.name}: ${err instanceof Error ? err.message : String(err)}`);
        return [] as NewsArticle[];
      }
    })
  );
  const articles = gathered.flat();

  // 이미 받아 둔 글은 한 번에 조회합니다.
  // 한 건씩 물어보면 수십 번 오가느라 제한 시간(60초)을 넘길 수 있습니다.
  const { data: existingRows } = await admin
    .from("posts")
    .select("source, source_id")
    .in("source", ["nhis", "mohw", "ltc"])
    .in(
      "source_id",
      articles.map((a) => a.sourceId)
    );
  const already = new Set(
    ((existingRows ?? []) as { source: string | null; source_id: string | null }[])
      .filter((row) => row.source && row.source_id)
      .map((row) => `${row.source}:${row.source_id}`)
  );

  // 새 글만 남기고, 오래된 것부터 들입니다. 한 번에 다 못 들이면 다음 날 이어 받습니다.
  const fresh = articles
    .filter((a) => !already.has(`${a.source}:${a.sourceId}`))
    .sort((a, b) => a.date.localeCompare(b.date));
  const skipped = articles.length - fresh.length;
  const deferred = Math.max(0, fresh.length - MAX_PER_RUN);

  let imported = 0;
  const preview: Record<string, unknown>[] = [];

  for (const article of fresh.slice(0, MAX_PER_RUN)) {
    let title = article.title;
    let content = `자세한 내용은 원문을 참고해 주세요: ${article.sourceUrl}`;
    try {
      const loaded = await article.loadBody();
      if (loaded.title) title = loaded.title;
      if (loaded.body) content = capContent(loaded.body, article.sourceUrl);
    } catch (err) {
      errors.push(
        `${article.source}/${article.sourceId} 본문: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    if (dry) {
      preview.push({
        source: article.source,
        date: article.date,
        title,
        length: content.length,
        head: content.slice(0, 300).replace(/\s+/g, " "),
        url: article.sourceUrl,
      });
      continue;
    }

    const { error } = await admin.from("posts").insert({
      title,
      category: "요양 정보",
      excerpt: content.slice(0, 120).replace(/\n/g, " "),
      content,
      read_minutes: estimateReadMinutes(content),
      // 원장님 결정: 공단·복지부 자료는 검토 없이 바로 홈페이지에 올립니다.
      is_published: true,
      published_at: toIso(article.date),
      source: article.source,
      source_id: article.sourceId,
      source_url: article.sourceUrl,
    });

    if (error) {
      errors.push(`${article.source}/${article.sourceId}: ${error.message}`);
    } else {
      imported++;
    }
  }

  return NextResponse.json({
    dry,
    imported,
    skipped,
    deferred,
    total: articles.length,
    errors,
    ...(dry ? { preview } : {}),
  });
}
