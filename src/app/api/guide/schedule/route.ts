import { employeeFromRequest, guideJson, guidePreflight, normName } from "@/lib/guide";

export const OPTIONS = guidePreflight;

const ym = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit" }).format(d);

// 앱: 내 방문 일정(지난달부터). 관리자가 올린 「서비스일정표」 에서 방문직원 이름이 나인 방문만.
export async function GET(request: Request) {
  const who = await employeeFromRequest(request);
  if (!who) return guideJson(request, { error: "앱 연결이 해제되었습니다. 사무실에서 QR로 다시 연결해 주세요." }, 401);
  const { admin, employee } = who;

  const now = new Date();
  const prev = ym(new Date(now.getFullYear(), now.getMonth() - 1, 15));
  const { data: schedules } = await admin
    .from("guide_schedules")
    .select("id, month, created_at")
    .gte("month", prev)
    .order("month");
  if (!schedules?.length) return guideJson(request, { months: [] });

  const ids = schedules.map((s) => s.id);
  const cols = "schedule_id, day, start_time, end_time, elder_name, service, tags";
  const { data: mine } = await admin.from("guide_schedule_visits").select(cols).in("schedule_id", ids).eq("employee_id", employee.id);

  // 올린 뒤에 앱에 가입한 선생님: 이름이 같은 재직 직원이 나 하나뿐이면 이름으로도 찾는다
  let late: typeof mine = [];
  const { data: same } = await admin.from("profiles").select("id, name").eq("is_active", true).eq("name", employee.name);
  if ((same ?? []).filter((p) => normName(p.name) === normName(employee.name)).length === 1) {
    const { data } = await admin
      .from("guide_schedule_visits")
      .select(cols)
      .in("schedule_id", ids)
      .is("employee_id", null)
      .eq("staff_name", employee.name);
    late = data ?? [];
  }

  const visits = [...(mine ?? []), ...(late ?? [])];
  return guideJson(request, {
    months: schedules.map((s) => ({
      month: s.month,
      publishedAt: s.created_at,
      visits: visits
        .filter((v) => v.schedule_id === s.id)
        .map((v) => ({ day: v.day, start: v.start_time, end: v.end_time, elder: v.elder_name, service: v.service, tags: v.tags }))
        .sort((a, b) => a.day - b.day || a.start.localeCompare(b.start)),
    })),
  });
}
