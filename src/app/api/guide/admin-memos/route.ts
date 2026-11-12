import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";

// 관리자: 앱 메모 읽음 처리 / 되돌리기 body: { id, read: boolean }
export async function POST(request: Request) {
  const result = await requireAdmin();
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  const { admin, adminProfile } = result;
  const body = await request.json().catch(() => ({}));
  const id = String(body.id ?? "");
  if (!id) return NextResponse.json({ error: "메모를 찾을 수 없습니다." }, { status: 400 });
  const read = body.read !== false;
  const { error } = await admin
    .from("guide_memos")
    .update(read ? { read_at: new Date().toISOString(), read_by: adminProfile.id } : { read_at: null, read_by: null })
    .eq("id", id);
  if (error) {
    console.error(error);
    return NextResponse.json({ error: "처리 중 오류가 발생했습니다." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
