import { employeeFromRequest, guideJson, guidePreflight } from "@/lib/guide";

export const OPTIONS = guidePreflight;

// 앱: 이 폰의 푸시 등록 토큰(FCM)을 알립니다. body: { token, platform }
// 같은 토큰은 한 직원에게만 붙습니다(폰을 다른 직원이 연결하면 새 직원으로 옮겨집니다).
export async function POST(request: Request) {
  const who = await employeeFromRequest(request);
  if (!who) return guideJson(request, { error: "앱 연결이 해제되었습니다. 사무실에 문의해 주세요." }, 401);
  const body = await request.json().catch(() => ({}));
  const token = String(body.token ?? "").trim();
  if (token.length < 20 || token.length > 4096) return guideJson(request, { error: "토큰이 바르지 않습니다." }, 400);
  const { error } = await who.admin.from("guide_push_tokens").upsert(
    { employee_id: who.employee.id, token, platform: String(body.platform ?? "android").slice(0, 20), updated_at: new Date().toISOString() },
    { onConflict: "token" }
  );
  if (error) {
    console.error(error);
    return guideJson(request, { error: "저장 중 오류가 발생했습니다." }, 500);
  }
  return guideJson(request, { ok: true });
}
