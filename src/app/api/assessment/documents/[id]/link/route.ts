import { NextResponse } from "next/server";
import { requireSocialWorker } from "@/lib/require-social-worker";

// 미연결 서류를 사람이 직접 수급자에게 붙입니다.
// 인정번호가 없어 자동으로 붙이지 못한 서류가 대상입니다.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireSocialWorker();
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  const { admin } = result;
  const { id } = await params;
  const body = await request.json();
  const recipientId = body.care_recipient_id;

  if (recipientId === null) {
    // 연결 해제
    const { error } = await admin
      .from("care_documents")
      .update({ care_recipient_id: null, match_status: "unmatched" })
      .eq("id", id);
    if (error) {
      console.error(error);
      return NextResponse.json({ error: "연결 해제 중 오류가 발생했습니다." }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  if (typeof recipientId !== "string" || !recipientId) {
    return NextResponse.json({ error: "수급자를 선택해 주세요." }, { status: 400 });
  }

  // 실재하는 수급자인지 확인한 뒤 붙입니다.
  const { data: recipient } = await admin
    .from("care_recipients").select("id").eq("id", recipientId).maybeSingle();
  if (!recipient) {
    return NextResponse.json({ error: "존재하지 않는 수급자입니다." }, { status: 400 });
  }

  const { error } = await admin
    .from("care_documents")
    // 사람이 확인해 붙였다는 뜻으로 'manual' 로 남겨, 자동 연결과 구분합니다.
    .update({ care_recipient_id: recipientId, match_status: "manual" })
    .eq("id", id);
  if (error) {
    console.error(error);
    return NextResponse.json({ error: "연결 중 오류가 발생했습니다." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
