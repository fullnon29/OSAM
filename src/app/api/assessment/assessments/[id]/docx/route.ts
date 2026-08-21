import { NextResponse } from "next/server";
import { requireSocialWorker } from "@/lib/require-social-worker";
import { generateAssessmentDocx } from "@/lib/assessment-docx";
import type { RecipientInfo } from "@/lib/assessment-recipient";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireSocialWorker();
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  const { admin } = result;
  const { id } = await params;

  const { data: assessment, error } = await admin
    .from("needs_assessments")
    .select(
      "round_no, assessed_at, responses, final_summary, status, form_version, care_recipients(name, birth_date, gender, ltc_grade, ltc_number), profiles(name)"
    )
    .eq("id", id)
    .single();

  if (error || !assessment) {
    return NextResponse.json({ error: "욕구조사기록지를 찾을 수 없습니다." }, { status: 404 });
  }
  if (assessment.status !== "completed") {
    return NextResponse.json(
      { error: "완료된 욕구조사기록지만 다운로드할 수 있습니다." },
      { status: 400 }
    );
  }

  const recipient = assessment.care_recipients as unknown as RecipientInfo | null;
  const author = assessment.profiles as unknown as { name: string } | null;

  const buffer = await generateAssessmentDocx({
    recipient: recipient ?? { name: "미상" },
    roundNo: assessment.round_no,
    assessedAt: assessment.assessed_at,
    authorName: author?.name ?? "미상",
    responses: (assessment.responses ?? {}) as Record<string, string | string[] | number | undefined>,
    finalSummary: assessment.final_summary ?? "",
    formVersion: assessment.form_version,
  });

  const filename = encodeURIComponent(
    `${recipient?.name ?? "수급자"}_욕구조사기록지_${assessment.round_no}회차.docx`
  );

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="assessment.docx"; filename*=UTF-8''${filename}`,
      "Cache-Control": "no-store",
    },
  });
}
