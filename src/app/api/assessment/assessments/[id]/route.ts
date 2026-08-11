import { NextResponse } from "next/server";
import { requireSocialWorker } from "@/lib/require-social-worker";

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

  const { data, error } = await admin
    .from("needs_assessments")
    .update({
      assessed_at: body.assessed_at || undefined,
      responses: body.responses ?? {},
      draft_summary: body.draft_summary ?? null,
      ai_summary: body.ai_summary ?? null,
      final_summary: body.final_summary ?? null,
      status: body.status === "completed" ? "completed" : "draft",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error(error);
    return NextResponse.json({ error: "욕구사정 수정 중 오류가 발생했습니다." }, { status: 500 });
  }

  return NextResponse.json({ assessment: data });
}
