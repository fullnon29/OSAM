import { NextResponse } from "next/server";
import { requireSocialWorker } from "@/lib/require-social-worker";
import { generateAssessmentHwp, HwpFormVersionMismatchError } from "@/lib/assessment-hwp";

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
    .select("round_no, responses, status, form_version, care_recipients(name)")
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

  let buffer: Buffer;
  try {
    buffer = await generateAssessmentHwp(
      (assessment.responses ?? {}) as Record<string, string | string[] | number | undefined>,
      assessment.form_version
    );
  } catch (e) {
    // 템플릿과 서식 버전이 다르면 잘못된 칸에 체크된 문서가 나가므로 만들지 않습니다.
    if (e instanceof HwpFormVersionMismatchError) {
      return NextResponse.json({ error: e.message }, { status: 409 });
    }
    throw e;
  }

  const filename = encodeURIComponent(
    `${recipient?.name ?? "수급자"}_욕구조사기록지_${assessment.round_no}회차.hwp`
  );

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/x-hwp",
      "Content-Disposition": `attachment; filename="assessment.hwp"; filename*=UTF-8''${filename}`,
      "Cache-Control": "no-store",
    },
  });
}
