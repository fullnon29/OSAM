import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { pushNotice } from "@/lib/guide-notice-push";

export const maxDuration = 30;

// 관리자: 앱 공지 올리기 / 내리기
export async function POST(request: Request) {
  const result = await requireAdmin();
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  const { admin, adminProfile } = result;
  const body = await request.json();

  if (body.action === "hide") {
    const { error } = await admin.from("guide_notices").update({ is_active: false }).eq("id", body.id);
    if (error) return NextResponse.json({ error: "처리 중 오류가 발생했습니다." }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  const title = String(body.title ?? "").trim().slice(0, 200);
  const text = String(body.body ?? "").trim().slice(0, 5000);
  const link = String(body.linkUrl ?? "").trim();
  if (!title || !text) {
    return NextResponse.json({ error: "제목과 내용을 입력해 주세요." }, { status: 400 });
  }
  if (link && !/^https?:\/\//.test(link)) {
    return NextResponse.json({ error: "링크는 http:// 또는 https:// 로 시작해야 합니다." }, { status: 400 });
  }
  const requiresAck = body.requiresAck !== false;
  const { data: created, error } = await admin
    .from("guide_notices")
    .insert({
      title,
      body: text,
      link_url: link || null,
      requires_ack: requiresAck,
      created_by: adminProfile.id,
    })
    .select("id")
    .single();
  if (error || !created) {
    console.error(error);
    return NextResponse.json({ error: "저장 중 오류가 발생했습니다." }, { status: 500 });
  }
  // 새 공지는 선생님 폰에 푸시로 알립니다(끄려면 push:false). 푸시가 실패해도 공지는 올라갑니다.
  let push: { pushed: number; devices: number; errors: string[] } | null = null;
  if (body.push !== false) {
    try {
      push = await pushNotice(admin, { id: created.id as string, title, body: text, requiresAck });
    } catch (e) {
      console.error(e);
      push = { pushed: 0, devices: 0, errors: [e instanceof Error ? e.message : String(e)] };
    }
  }
  return NextResponse.json({ ok: true, push });
}
