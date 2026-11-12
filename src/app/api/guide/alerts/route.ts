import { employeeFromRequest, guideJson, guidePreflight } from "@/lib/guide";

export const OPTIONS = guidePreflight;

// 앱: 내 안내(주말·휴일 일정 안내 등). 최근 3주 것을 최신순으로.
export async function GET(request: Request) {
  const who = await employeeFromRequest(request);
  if (!who) return guideJson(request, { error: "앱 연결이 해제되었습니다. 사무실에 문의해 주세요." }, 401);
  const since = new Date(Date.now() - 21 * 86400000).toISOString().slice(0, 10);
  const { data } = await who.admin
    .from("guide_alerts")
    .select("id, kind, alert_date, title, body, items, acked_at")
    .eq("employee_id", who.employee.id)
    .gte("alert_date", since)
    .order("alert_date", { ascending: false });
  return guideJson(request, {
    alerts: (data ?? []).map((a) => ({
      id: a.id, kind: a.kind, date: a.alert_date, title: a.title, body: a.body, items: a.items, ackedAt: a.acked_at,
    })),
  });
}

// 앱: 「확인했습니다」 body: { id }
export async function POST(request: Request) {
  const who = await employeeFromRequest(request);
  if (!who) return guideJson(request, { error: "앱 연결이 해제되었습니다. 사무실에 문의해 주세요." }, 401);
  const body = await request.json().catch(() => ({}));
  const id = String(body.id ?? "");
  if (!id) return guideJson(request, { error: "안내를 찾을 수 없습니다." }, 400);
  const { error } = await who.admin
    .from("guide_alerts")
    .update({ acked_at: new Date().toISOString() })
    .eq("id", id)
    .eq("employee_id", who.employee.id)
    .is("acked_at", null);
  if (error) {
    console.error(error);
    return guideJson(request, { error: "확인 기록 중 오류가 발생했습니다." }, 500);
  }
  return guideJson(request, { ok: true });
}
