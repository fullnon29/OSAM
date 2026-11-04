import content from "@/guide-content/content.json";
import { employeeFromRequest, guideJson, guidePreflight } from "@/lib/guide";

export const OPTIONS = guidePreflight;

// 앱: 앱 내용(평가 안내·예시문·교육·운영규정)을 APK 재설치 없이 받는다.
// content.json 은 앱 폴더의 tools/export_content.mjs 로 만든다. 운영규정이 들어 있으므로 연결된 직원에게만 준다.
export async function GET(request: Request) {
  const who = await employeeFromRequest(request);
  if (!who) return guideJson(request, { error: "앱 연결이 해제되었습니다. 사무실에서 QR로 다시 연결해 주세요." }, 401);
  const have = new URL(request.url).searchParams.get("have");
  if (have === content.version) return guideJson(request, { version: content.version, same: true });
  return guideJson(request, content);
}
