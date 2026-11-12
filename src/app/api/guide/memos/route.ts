import { employeeFromRequest, guideJson, guidePreflight } from "@/lib/guide";

export const OPTIONS = guidePreflight;

const DAILY_LIMIT = 30;

// 앱: 내가 센터에 남긴 메모(최신 30개)
export async function GET(request: Request) {
  const who = await employeeFromRequest(request);
  if (!who) return guideJson(request, { error: "앱 연결이 해제되었습니다. 사무실에 문의해 주세요." }, 401);
  const { data } = await who.admin
    .from("guide_memos")
    .select("id, elder_name, body, created_at, read_at")
    .eq("employee_id", who.employee.id)
    .order("created_at", { ascending: false })
    .limit(30);
  return guideJson(request, {
    memos: (data ?? []).map((m) => ({ id: m.id, elderName: m.elder_name, body: m.body, createdAt: m.created_at, readAt: m.read_at })),
  });
}

// 앱: 센터에 메모 남기기 body: { elderName, body }
export async function POST(request: Request) {
  const who = await employeeFromRequest(request);
  if (!who) return guideJson(request, { error: "앱 연결이 해제되었습니다. 사무실에 문의해 주세요." }, 401);
  const body = await request.json().catch(() => ({}));
  const elder = String(body.elderName ?? "").trim().slice(0, 50);
  const text = String(body.body ?? "").trim().slice(0, 2000);
  if (!elder) return guideJson(request, { error: "어르신을 골라 주세요." }, 400);
  if (!text) return guideJson(request, { error: "메모 내용을 적어 주세요." }, 400);
  const since = new Date(Date.now() - 86400000).toISOString();
  const { count } = await who.admin
    .from("guide_memos")
    .select("id", { count: "exact", head: true })
    .eq("employee_id", who.employee.id)
    .gte("created_at", since);
  if ((count ?? 0) >= DAILY_LIMIT) return guideJson(request, { error: "하루에 남길 수 있는 메모 수를 넘었습니다. 센터로 전화해 주세요." }, 429);
  const { data, error } = await who.admin
    .from("guide_memos")
    .insert({ employee_id: who.employee.id, elder_name: elder, body: text })
    .select("id, created_at")
    .single();
  if (error || !data) {
    console.error(error);
    return guideJson(request, { error: "저장 중 오류가 발생했습니다." }, 500);
  }
  return guideJson(request, { id: data.id, createdAt: data.created_at });
}
