import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { kstInputValueToIso } from "@/lib/format";

export async function POST(request: Request) {
  const result = await requireAdmin();
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  const { admin, adminProfile } = result;

  const { employeeId, courseId, newTime, reason } = await request.json();
  if (!employeeId || !courseId || !newTime || !reason?.trim()) {
    return NextResponse.json(
      { error: "employeeId, courseId, newTime, reason이 모두 필요합니다." },
      { status: 400 }
    );
  }

  const { data: completion, error: fetchError } = await admin
    .from("course_completions")
    .select("id, completed_at")
    .eq("employee_id", employeeId)
    .eq("course_id", courseId)
    .single();

  if (fetchError || !completion) {
    return NextResponse.json(
      { error: "이수 기록이 없습니다. 먼저 완료 처리를 해주세요." },
      { status: 404 }
    );
  }

  const originalTime = completion.completed_at;
  const newTimeIso = kstInputValueToIso(newTime);

  const { error: updateError } = await admin
    .from("course_completions")
    .update({ completed_at: newTimeIso })
    .eq("id", completion.id);
  if (updateError) {
    console.error(updateError);
    return NextResponse.json({ error: "수정 중 오류가 발생했습니다." }, { status: 500 });
  }

  const { error: logError } = await admin.from("completion_edit_logs").insert({
    completion_id: completion.id,
    employee_id: employeeId,
    course_id: courseId,
    original_time: originalTime,
    new_time: newTimeIso,
    reason: reason.trim(),
    edited_by: adminProfile.id,
  });
  if (logError) {
    console.error(logError);
    return NextResponse.json({ error: "로그 기록 중 오류가 발생했습니다." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
