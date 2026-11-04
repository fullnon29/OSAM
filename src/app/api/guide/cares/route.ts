import { cleanCares, employeeFromRequest, guideJson, guidePreflight, loadCares, saveCares } from "@/lib/guide";

export const OPTIONS = guidePreflight;

// 앱: 내 담당 어르신과 케어 시 주의점 보기
export async function GET(request: Request) {
  const who = await employeeFromRequest(request);
  if (!who) return guideJson(request, { error: "앱 연결이 해제되었습니다. 사무실에서 다시 연결해 주세요." }, 401);
  return guideJson(request, { cares: await loadCares(who.admin, who.employee.id) });
}

// 앱: 담당 어르신 목록 저장 (통째로 바꿈) body: { cares: [{ elderName, cautions }] }
export async function POST(request: Request) {
  const who = await employeeFromRequest(request);
  if (!who) return guideJson(request, { error: "앱 연결이 해제되었습니다. 사무실에서 다시 연결해 주세요." }, 401);
  const body = await request.json().catch(() => ({}));
  const cares = cleanCares(body.cares);
  try {
    await saveCares(who.admin, who.employee.id, cares);
  } catch (err) {
    console.error(err);
    return guideJson(request, { error: "저장 중 오류가 발생했습니다." }, 500);
  }
  return guideJson(request, { cares });
}
