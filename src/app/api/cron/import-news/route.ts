import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  fetchRelevantNhisArticles,
  extractArticleBody,
  estimateReadMinutes,
} from "@/lib/nhis-import";

export const maxDuration = 60;

function toIsoDate(nhisDate: string) {
  // "2026.07.29" -> ISO
  const [y, m, d] = nhisDate.split(".").map((s) => s.trim());
  if (!y || !m || !d) return new Date().toISOString();
  return new Date(`${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}T09:00:00+09:00`).toISOString();
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "인증되지 않은 요청입니다." }, { status: 401 });
  }

  const admin = createAdminClient();
  const articles = await fetchRelevantNhisArticles();

  // 이미 받아 둔 글은 한 번에 조회합니다.
  // 한 건씩 물어보면 수십 번 오가느라 제한 시간(60초)을 넘길 수 있습니다.
  const { data: existingRows } = await admin
    .from("posts")
    .select("source_id")
    .eq("source", "nhis")
    .in(
      "source_id",
      articles.map((a) => a.articleNo)
    );
  const already = new Set(
    ((existingRows ?? []) as { source_id: string | null }[])
      .map((row) => row.source_id)
      .filter((id): id is string => !!id)
  );

  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const article of articles) {
    if (already.has(article.articleNo)) {
      skipped++;
      continue;
    }

    let content = `자세한 내용은 원문을 참고해 주세요: ${article.sourceUrl}`;
    if (article.pdfAttachNo) {
      const body = await extractArticleBody(article.articleNo, article.pdfAttachNo);
      if (body) content = body;
    }

    const { error } = await admin.from("posts").insert({
      title: article.title,
      category: "요양 정보",
      excerpt: content.slice(0, 120).replace(/\n/g, " "),
      content,
      read_minutes: estimateReadMinutes(content),
      // 원장님 결정: 공단 보도자료는 검토 없이 바로 홈페이지에 올립니다.
      is_published: true,
      published_at: toIsoDate(article.date),
      source: "nhis",
      source_id: article.articleNo,
      source_url: article.sourceUrl,
    });

    if (error) {
      errors.push(`${article.articleNo}: ${error.message}`);
    } else {
      imported++;
    }
  }

  return NextResponse.json({ imported, skipped, total: articles.length, errors });
}
