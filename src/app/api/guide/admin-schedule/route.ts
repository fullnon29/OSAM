import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { isCenterVisit } from "@/lib/schedule-parse";

const TIME = /^\d{2}:\d{2}$/;
const str = (v: unknown, max = 40) => String(v ?? "").trim().slice(0, max);

// 관리자: 일정표 게시(같은 달은 바꿔 넣음) / 지우기
// body: { action:'publish', month, fileName, pageCount, pages:[{ elder, visits:[{day,start,end,service,staff,tags}] }], mapping:{ 직원이름: employeeId|null } }
//       { action:'delete', month }
export async function POST(request: Request) {
  const result = await requireAdmin();
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  const { admin, adminProfile } = result;
  const body = await request.json().catch(() => ({}));
  const month = str(body.month, 7);
  if (!/^\d{4}-\d{2}$/.test(month)) return NextResponse.json({ error: "몇 월 일정표인지 알 수 없습니다." }, { status: 400 });

  if (body.action === "delete") {
    const { error } = await admin.from("guide_schedules").delete().eq("month", month);
    if (error) return NextResponse.json({ error: "삭제 중 오류가 발생했습니다." }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // 맞춘 직원 id 가 실제 직원인지 확인
  const mapping: Record<string, string | null> = body.mapping && typeof body.mapping === "object" ? body.mapping : {};
  const ids = [...new Set(Object.values(mapping).filter((v): v is string => typeof v === "string" && v.length > 0))];
  const { data: staff } = ids.length ? await admin.from("profiles").select("id").in("id", ids) : { data: [] };
  const valid = new Set((staff ?? []).map((p) => p.id));

  const rows: Record<string, unknown>[] = [];
  for (const p of Array.isArray(body.pages) ? body.pages.slice(0, 500) : []) {
    const elder = str(p?.elder);
    if (!elder) continue;
    for (const v of Array.isArray(p.visits) ? p.visits.slice(0, 200) : []) {
      const day = Number(v?.day);
      const start = str(v?.start, 5);
      const end = str(v?.end, 5);
      const service = str(v?.service) || "방문요양";
      const staffName = str(v?.staff);
      if (!(day >= 1 && day <= 31) || !TIME.test(start) || !TIME.test(end) || !staffName || isCenterVisit(service)) continue;
      const emp = mapping[staffName];
      rows.push({
        month,
        day,
        start_time: start,
        end_time: end,
        elder_name: elder,
        staff_name: staffName,
        employee_id: typeof emp === "string" && valid.has(emp) ? emp : null,
        service,
        tags: (Array.isArray(v.tags) ? v.tags : []).map((t: unknown) => str(t, 10)).filter(Boolean).slice(0, 5),
      });
    }
  }
  if (!rows.length) return NextResponse.json({ error: "저장할 방문 일정이 없습니다." }, { status: 400 });

  // 같은 달 일정표는 지우고(방문도 함께 지워짐) 새로 넣는다
  await admin.from("guide_schedules").delete().eq("month", month);
  const { data: sched, error } = await admin
    .from("guide_schedules")
    .insert({ month, file_name: str(body.fileName, 200) || null, page_count: Number(body.pageCount) || null, uploaded_by: adminProfile.id })
    .select("id")
    .single();
  if (error || !sched) {
    console.error(error);
    return NextResponse.json({ error: "저장 중 오류가 발생했습니다." }, { status: 500 });
  }
  for (let i = 0; i < rows.length; i += 500) {
    const { error: e } = await admin
      .from("guide_schedule_visits")
      .insert(rows.slice(i, i + 500).map((r) => ({ ...r, schedule_id: sched.id })));
    if (e) {
      console.error(e);
      await admin.from("guide_schedules").delete().eq("id", sched.id);
      return NextResponse.json({ error: "방문 일정 저장 중 오류가 발생했습니다." }, { status: 500 });
    }
  }
  return NextResponse.json({ ok: true, saved: rows.length, matched: rows.filter((r) => r.employee_id).length });
}
