import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { buildRegisterPdf, type RegisterRow } from "@/lib/training-register";

// 관리자: 교육 하나의 「교육 실시 대장(참석자 명부)」 PDF (평가 증빙 제출용)
export async function GET(request: Request) {
  const result = await requireAdmin();
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  const { admin } = result;
  const courseId = new URL(request.url).searchParams.get("courseId");

  const { data: course } = await admin.from("courses").select("*").eq("id", courseId).single();
  if (!course) return NextResponse.json({ error: "교육을 찾을 수 없습니다." }, { status: 404 });

  const { data: employees } = await admin
    .from("profiles")
    .select("id, name, dept")
    .in("role", ["employee", "social_worker"])
    .eq("is_active", true)
    .order("name");
  const { data: completions } = await admin
    .from("course_completions")
    .select("*, profile:profiles(name, dept)")
    .eq("course_id", course.id)
    .order("completed_at");
  const { data: logs } = await admin
    .from("completion_edit_logs")
    .select("original_time, new_time, reason, edited_at, employee:profiles!completion_edit_logs_employee_id_fkey(name)")
    .eq("course_id", course.id)
    .order("edited_at");

  const rows: RegisterRow[] = [];
  for (const c of completions ?? []) {
    let signature: Uint8Array | null = null;
    if (c.signature_path) {
      const { data: blob } = await admin.storage.from("signatures").download(c.signature_path);
      if (blob) signature = new Uint8Array(await blob.arrayBuffer());
    }
    const p = c.profile as { name: string; dept: string | null } | null;
    rows.push({
      name: p?.name ?? "(삭제된 직원)",
      dept: p?.dept ?? null,
      completedAt: c.completed_at,
      certNo: c.cert_no,
      source: c.source ?? "web",
      signature,
    });
  }
  const done = new Set((completions ?? []).map((c) => c.employee_id));

  const pdf = await buildRegisterPdf({
    orgName: "오샘재가복지센터",
    course: { name: course.name, method: course.method ?? null, instructor: course.instructor ?? null, content: course.content ?? null },
    rows,
    missing: (employees ?? []).filter((e) => !done.has(e.id)).map((e) => ({ name: e.name, dept: e.dept })),
    logs: (logs ?? []).map((g) => ({
      name: (g.employee as unknown as { name: string } | null)?.name ?? "",
      originalTime: g.original_time,
      newTime: g.new_time,
      reason: g.reason,
      editedAt: g.edited_at,
    })),
    printedAt: new Date().toISOString(),
  });

  const filename = encodeURIComponent(`교육실시대장_${course.name}.pdf`);
  return new NextResponse(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename*=UTF-8''${filename}`,
    },
  });
}
