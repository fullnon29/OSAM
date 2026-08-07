import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { POST_CATEGORIES } from "@/lib/posts";

export async function POST(request: Request) {
  const result = await requireAdmin();
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  const { admin, adminProfile } = result;

  const body = await request.json();
  const { title, category, excerpt, content, read_minutes, is_published, thumbnail_url } = body;

  if (!title?.trim() || !content?.trim()) {
    return NextResponse.json({ error: "제목과 본문은 필수입니다." }, { status: 400 });
  }
  if (!POST_CATEGORIES.includes(category)) {
    return NextResponse.json({ error: "카테고리가 올바르지 않습니다." }, { status: 400 });
  }

  const { data, error } = await admin
    .from("posts")
    .insert({
      title: title.trim(),
      category,
      excerpt: excerpt?.trim() || null,
      content: content.trim(),
      read_minutes: read_minutes || null,
      is_published: is_published ?? true,
      thumbnail_url: thumbnail_url?.trim() || null,
      author_id: adminProfile.id,
    })
    .select()
    .single();

  if (error) {
    console.error(error);
    return NextResponse.json({ error: "글 등록 중 오류가 발생했습니다." }, { status: 500 });
  }

  return NextResponse.json({ post: data });
}
