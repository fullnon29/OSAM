import type { SupabaseClient } from "@supabase/supabase-js";
import { employeeFromRequest, guideJson, guidePreflight, normName } from "@/lib/guide";

export const OPTIONS = guidePreflight;

const ym = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit" }).format(d);
const COLS = "schedule_id, day, start_time, end_time, elder_name, staff_name, service, tags";
type Row = {
  schedule_id: string;
  day: number;
  start_time: string;
  end_time: string;
  elder_name: string;
  staff_name: string;
  service: string;
  tags: string[];
};

// 한 번에 1000줄까지만 오므로 나눠 받는다 (한 달 전체가 2천 건 가까이 됨)
async function allRows(admin: SupabaseClient, ids: string[], filter?: (q: ReturnType<typeof base>) => ReturnType<typeof base>) {
  const rows: Row[] = [];
  for (let from = 0; from < 20000; from += 1000) {
    let q = base(admin, ids);
    if (filter) q = filter(q);
    const { data, error } = await q.order("id").range(from, from + 999);
    if (error) throw error;
    rows.push(...((data ?? []) as Row[]));
    if (!data || data.length < 1000) break;
  }
  return rows;
}
const base = (admin: SupabaseClient, ids: string[]) => admin.from("guide_schedule_visits").select(COLS).in("schedule_id", ids);

// 앱: 방문 일정(지난달부터).
//  - 요양보호사: 일정표 방문직원 이름이 나인 방문만
//  - 시설장(관리자)·사회복지사: 모든 어르신의 방문 (방문직원 이름 포함, scope: 'all')
export async function GET(request: Request) {
  const who = await employeeFromRequest(request);
  if (!who) return guideJson(request, { error: "앱 연결이 해제되었습니다. 사무실에서 QR로 다시 연결해 주세요." }, 401);
  const { admin, employee } = who;

  const { data: me } = await admin.from("profiles").select("role").eq("id", employee.id).single();
  const all = me?.role === "admin" || me?.role === "social_worker";

  const now = new Date();
  const prev = ym(new Date(now.getFullYear(), now.getMonth() - 1, 15));
  const { data: schedules } = await admin
    .from("guide_schedules")
    .select("id, month, created_at")
    .gte("month", prev)
    .order("month");
  if (!schedules?.length) return guideJson(request, { scope: all ? "all" : "mine", months: [] });
  const ids = schedules.map((s) => s.id);

  let visits: Row[];
  try {
    if (all) {
      visits = await allRows(admin, ids);
    } else {
      visits = await allRows(admin, ids, (q) => q.eq("employee_id", employee.id));
      // 올린 뒤에 앱에 가입한 선생님: 이름이 같은 재직 직원이 나 하나뿐이면 이름으로도 찾는다
      const { data: same } = await admin.from("profiles").select("id, name").eq("is_active", true).eq("name", employee.name);
      if ((same ?? []).filter((p) => normName(p.name) === normName(employee.name)).length === 1) {
        visits.push(...(await allRows(admin, ids, (q) => q.is("employee_id", null).eq("staff_name", employee.name))));
      }
    }
  } catch (e) {
    console.error(e);
    return guideJson(request, { error: "일정을 불러오지 못했습니다." }, 500);
  }

  return guideJson(request, {
    scope: all ? "all" : "mine",
    months: schedules.map((s) => ({
      month: s.month,
      publishedAt: s.created_at,
      visits: visits
        .filter((v) => v.schedule_id === s.id)
        .map((v) => ({
          day: v.day,
          start: v.start_time,
          end: v.end_time,
          elder: v.elder_name,
          service: v.service,
          tags: v.tags,
          ...(all ? { staff: v.staff_name } : {}),
        }))
        .sort((a, b) => a.day - b.day || a.start.localeCompare(b.start) || a.elder.localeCompare(b.elder, "ko")),
    })),
  });
}
