import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { pushNotice } from "@/lib/guide-notice-push";

export const maxDuration = 30;

// 서류정리 도구(데스크톱 앱)가 올린 공지를 선생님 폰에 푸시로 알립니다. body: { noticeId }
// 인증: Authorization: Bearer <GUIDE_CRON_SECRET>
export async function POST(request: Request) {
  const secret = process.env.GUIDE_CRON_SECRET;
  if (!secret || (request.headers.get("authorization") ?? "") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 401 });
  }
  const body = await request.json().catch(() => ({}));
  const id = String(body.noticeId ?? "");
  if (!id) return NextResponse.json({ error: "공지를 찾을 수 없습니다." }, { status: 400 });
  const admin = createAdminClient();
  const { data: n } = await admin.from("guide_notices").select("id, title, body, requires_ack, is_active").eq("id", id).single();
  if (!n || !n.is_active) return NextResponse.json({ error: "올라가 있는 공지가 아닙니다." }, { status: 404 });
  try {
    const push = await pushNotice(admin, { id: n.id as string, title: String(n.title), body: String(n.body), requiresAck: !!n.requires_ack });
    return NextResponse.json({ ok: true, push });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
