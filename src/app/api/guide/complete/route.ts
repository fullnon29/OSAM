import { recordCompletion } from "@/lib/certificate";
import {
  decodeSignature,
  employeeFromRequest,
  ensureGuideCourse,
  guideJson,
  guidePreflight,
} from "@/lib/guide";

export const OPTIONS = guidePreflight;

// 앱에서 확인 체크 + 서명 후 이수. body: { kind: 'rules' | 'onboard-N', confirmText, signature(data URL) }
export async function POST(request: Request) {
  const who = await employeeFromRequest(request);
  if (!who) return guideJson(request, { error: "앱 연결이 해제되었습니다. 사무실에서 QR로 다시 연결해 주세요." }, 401);
  const { admin, employee } = who;

  const body = await request.json().catch(() => ({}));
  const confirmText = String(body.confirmText ?? "").trim();
  if (!confirmText) return guideJson(request, { error: "확인 칸에 체크해 주세요." }, 400);
  const signaturePng = decodeSignature(body.signature);
  if (!signaturePng) return guideJson(request, { error: "서명을 해 주세요." }, 400);

  const course = await ensureGuideCourse(admin, String(body.kind ?? ""));
  if (!course) return guideJson(request, { error: "알 수 없는 교육입니다." }, 400);

  // 같은 기간에 이미 이수했으면 기존 기록을 그대로 돌려준다(수료번호·시각을 덮어쓰지 않음).
  const { data: existing } = await admin
    .from("course_completions")
    .select("completed_at, cert_no")
    .eq("employee_id", employee.id)
    .eq("course_id", course.id)
    .maybeSingle();
  if (existing) {
    return guideJson(request, { already: true, courseName: course.name, completedAt: existing.completed_at, certNo: existing.cert_no });
  }

  try {
    const completion = await recordCompletion(admin, {
      employeeId: employee.id,
      employeeName: employee.name,
      courseId: course.id,
      courseName: course.name,
      signaturePng,
      confirmText: confirmText.slice(0, 200),
      source: "app",
      deviceInfo: `평가 길잡이 앱 · ${(request.headers.get("user-agent") ?? "").slice(0, 200)}`,
    });
    return guideJson(request, { courseName: course.name, completedAt: completion.completed_at, certNo: completion.cert_no });
  } catch (err) {
    console.error(err);
    return guideJson(request, { error: "이수 처리 중 오류가 발생했습니다." }, 500);
  }
}
