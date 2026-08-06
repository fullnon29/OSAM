import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { recordCompletion } from "@/lib/certificate";

export async function POST(request: Request) {
  const result = await requireAdmin();
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  const { admin } = result;

  const { employeeId, courseId } = await request.json();
  if (!employeeId || !courseId) {
    return NextResponse.json({ error: "employeeId, courseId가 필요합니다." }, { status: 400 });
  }

  const { data: employee } = await admin
    .from("profiles")
    .select("id, name")
    .eq("id", employeeId)
    .single();
  const { data: course } = await admin
    .from("courses")
    .select("id, name")
    .eq("id", courseId)
    .single();

  if (!employee || !course) {
    return NextResponse.json({ error: "대상을 찾을 수 없습니다." }, { status: 404 });
  }

  try {
    const completion = await recordCompletion(admin, {
      employeeId: employee.id,
      employeeName: employee.name,
      courseId: course.id,
      courseName: course.name,
    });
    return NextResponse.json({ completion });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "처리 중 오류가 발생했습니다." }, { status: 500 });
  }
}
