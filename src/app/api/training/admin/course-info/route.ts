import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";

// 관리자: 교육 실시 대장에 들어갈 교육방법·강사명·교육내용 저장
export async function POST(request: Request) {
  const result = await requireAdmin();
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  const body = await request.json();
  const clean = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 1000) : null);
  const { error } = await result.admin
    .from("courses")
    .update({ method: clean(body.method), instructor: clean(body.instructor), content: clean(body.content) })
    .eq("id", body.courseId);
  if (error) {
    return NextResponse.json({ error: "저장 중 오류가 발생했습니다." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
