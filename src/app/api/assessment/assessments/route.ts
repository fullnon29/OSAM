import { NextResponse } from "next/server";
import { requireSocialWorker } from "@/lib/require-social-worker";
import { CURRENT_FORM_VERSION } from "@/lib/assessment-form";

export async function POST(request: Request) {
  const result = await requireSocialWorker();
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  const { admin, profile } = result;

  const body = await request.json();
  const careRecipientId = body.care_recipient_id;
  if (!careRecipientId) {
    return NextResponse.json({ error: "수급자 정보가 필요합니다." }, { status: 400 });
  }

  const { count } = await admin
    .from("needs_assessments")
    .select("id", { count: "exact", head: true })
    .eq("care_recipient_id", careRecipientId);
  const roundNo = (count ?? 0) + 1;

  const { data, error } = await admin
    .from("needs_assessments")
    .insert({
      care_recipient_id: careRecipientId,
      round_no: roundNo,
      author_id: profile.id,
      assessed_at: body.assessed_at || new Date().toISOString().slice(0, 10),
      responses: body.responses ?? {},
      // 지금 화면이 그린 서식으로 답한 것이므로 그 버전을 함께 남깁니다.
      form_version: CURRENT_FORM_VERSION,
      draft_summary: body.draft_summary ?? null,
      ai_summary: body.ai_summary ?? null,
      final_summary: body.final_summary ?? null,
      status: body.status === "completed" ? "completed" : "draft",
    })
    .select()
    .single();

  if (error) {
    console.error(error);
    return NextResponse.json({ error: "욕구사정 저장 중 오류가 발생했습니다." }, { status: 500 });
  }

  return NextResponse.json({ assessment: data });
}
