import { employeeFromRequest, guideJson, guidePreflight } from "@/lib/guide";

export const OPTIONS = guidePreflight;

// 연결된 직원 이름과, 앱 과정(운영규정·신규입문) 이수 기록
export async function GET(request: Request) {
  const who = await employeeFromRequest(request);
  if (!who) return guideJson(request, { error: "앱 연결이 해제되었습니다. 사무실에서 QR로 다시 연결해 주세요." }, 401);
  const { admin, employee } = who;

  const { data } = await admin
    .from("course_completions")
    .select("completed_at, cert_no, course:courses!inner(guide_key, name)")
    .eq("employee_id", employee.id)
    .not("course.guide_key", "is", null);

  const completions = (data ?? []).map((c) => {
    const course = c.course as unknown as { guide_key: string; name: string };
    return { key: course.guide_key, name: course.name, completedAt: c.completed_at, certNo: c.cert_no };
  });
  return guideJson(request, { name: employee.name, completions });
}
