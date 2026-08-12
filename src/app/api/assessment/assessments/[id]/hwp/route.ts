import { NextResponse } from "next/server";
import { requireSocialWorker } from "@/lib/require-social-worker";
import { generateAssessmentHwp } from "@/lib/assessment-hwp";

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
    .select("round_no, responses, status, care_recipients(name)")
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

  const recipient = assessment.care_recipients as unknown as { name: string } | null;

  const buffer = await generateAssessmentHwp(
    (assessment.responses ?? {}) as Record<string, string | string[] | undefined>
  );

  const filename = encodeURIComponent(
    `${recipient?.name ?? "수급자"}_욕구조사기록지_${assessment.round_no}회차.hwp`
  );

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/x-hwp",
      "Content-Disposition": `attachment; filename="assessment.hwp"; filename*=UTF-8''${filename}`,
    },
  });
}
