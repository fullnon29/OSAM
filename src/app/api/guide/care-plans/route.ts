import { employeeFromRequest, guideJson, guidePreflight, normName } from "@/lib/guide";

export const OPTIONS = guidePreflight;

type Caution = { text?: string; visible?: boolean };
type Alloc = { group?: string; label?: string; cycle?: string; minutes?: number; visible?: boolean };

// 앱: 내 담당 어르신의 급여제공계획(센터가 「노출」로 지정한 유의사항·시간 분배와 센터 코멘트만).
//  - 요양보호사: 내 일정에 방문이 있는 어르신 + 내 담당 어르신 목록의 어르신
//  - 시설장(관리자)·사회복지사: 모든 어르신
// 숨김으로 지정된 내용은 서버가 아예 내려보내지 않는다(앱 화면에서 가리는 것이 아님).
export async function GET(request: Request) {
  const who = await employeeFromRequest(request);
  if (!who) return guideJson(request, { error: "앱 연결이 해제되었습니다. 사무실에 문의해 주세요." }, 401);
  const { admin, employee } = who;

  const { data: me } = await admin.from("profiles").select("role").eq("id", employee.id).single();
  const all = me?.role === "admin" || me?.role === "social_worker";

  let keys: Set<string> | null = null;
  if (!all) {
    keys = new Set<string>();
    const { data: cares } = await admin.from("guide_staff_cares").select("elder_name").eq("employee_id", employee.id);
    for (const c of cares ?? []) keys.add(normName(c.elder_name));
    const since = new Date(Date.now() - 45 * 86400000).toISOString().slice(0, 7);
    for (let from = 0; from < 10000; from += 1000) {
      const { data, error } = await admin
        .from("guide_schedule_visits")
        .select("elder_name, employee_id, staff_name")
        .gte("month", since)
        .or(`employee_id.eq.${employee.id},and(employee_id.is.null,staff_name.eq.${employee.name})`)
        .order("id")
        .range(from, from + 999);
      if (error) break;
      for (const v of data ?? []) keys.add(normName(v.elder_name));
      if (!data || data.length < 1000) break;
    }
  }

  const { data: plans, error } = await admin
    .from("guide_care_plans")
    .select("elder_key, elder_name, plan_no, applied_from, applied_to, cautions, time_alloc, center_comment, updated_at");
  if (error) {
    console.error(error);
    return guideJson(request, { error: "계획서를 불러오지 못했습니다." }, 500);
  }

  const out = [];
  for (const p of plans ?? []) {
    if (keys && !keys.has(p.elder_key as string)) continue;
    const cautions = ((p.cautions ?? []) as Caution[]).filter((c) => c.visible && String(c.text ?? "").trim()).map((c) => String(c.text).trim());
    const allAlloc = ((p.time_alloc ?? []) as Alloc[]).filter((t) => String(t.label ?? "").trim());
    const time = allAlloc
      .filter((t) => t.visible)
      .map((t) => ({ group: String(t.group ?? "").trim(), label: String(t.label).trim(), cycle: String(t.cycle ?? "").trim(), minutes: Number(t.minutes) || 0 }));
    // 센터가 시간 분배 항목을 모두 보이게 한 경우에만, 매 방문(「일」 주기 항목) 합계를 함께 보냅니다(일부만 보이면 합계가 틀려 보이므로).
    const dailyTotal = time.length && time.length === allAlloc.length
      ? time.reduce((a, t) => { const m = /^일\s*(\d+)\s*회/.exec(t.cycle); return a + (m ? Number(m[1]) : 0) * t.minutes; }, 0)
      : 0;
    const comment = String(p.center_comment ?? "").trim();
    if (!cautions.length && !time.length && !comment) continue;
    out.push({
      elder: p.elder_name,
      planNo: p.plan_no,
      from: p.applied_from,
      to: p.applied_to,
      cautions,
      time,
      dailyTotal,
      comment,
      updatedAt: p.updated_at,
    });
  }
  out.sort((a, b) => String(a.elder).localeCompare(String(b.elder), "ko"));
  return guideJson(request, { scope: all ? "all" : "mine", plans: out });
}
