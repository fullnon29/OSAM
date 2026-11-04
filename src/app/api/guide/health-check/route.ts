import { employeeFromRequest, guideJson, guidePreflight } from "@/lib/guide";

export const OPTIONS = guidePreflight;

const MAX_BYTES = 3_000_000; // 앱이 줄여서 보내므로 보통 1MB 안팎

// 앱: 내가 올린 건강검진 결과 사진 목록 (날짜만)
export async function GET(request: Request) {
  const who = await employeeFromRequest(request);
  if (!who) return guideJson(request, { error: "앱 연결이 해제되었습니다. 사무실에 문의해 주세요." }, 401);
  const { data } = await who.admin
    .from("guide_health_checks")
    .select("id, uploaded_at")
    .eq("employee_id", who.employee.id)
    .order("uploaded_at", { ascending: false });
  return guideJson(request, { checks: (data ?? []).map((c) => ({ id: c.id, uploadedAt: c.uploaded_at })) });
}

// 앱: 건강검진 결과통보서 사진 올리기 body: { image: "data:image/jpeg;base64,..." }
export async function POST(request: Request) {
  const who = await employeeFromRequest(request);
  if (!who) return guideJson(request, { error: "앱 연결이 해제되었습니다. 사무실에 문의해 주세요." }, 401);
  const { admin, employee } = who;

  const body = await request.json().catch(() => ({}));
  const m = /^data:image\/(jpeg|png);base64,(.+)$/.exec(String(body.image ?? ""));
  if (!m) return guideJson(request, { error: "사진을 다시 골라 주세요." }, 400);
  const bytes = Buffer.from(m[2], "base64");
  if (bytes.length < 1000 || bytes.length > MAX_BYTES) return guideJson(request, { error: "사진이 너무 작거나 큽니다. 다시 찍어 주세요." }, 400);

  const ext = m[1] === "png" ? "png" : "jpg";
  const path = `${employee.id}/${Date.now()}.${ext}`;
  const { error: upError } = await admin.storage
    .from("health-checks")
    .upload(path, bytes, { contentType: `image/${m[1]}`, upsert: false });
  if (upError) {
    console.error(upError);
    return guideJson(request, { error: "사진 저장 중 오류가 발생했습니다." }, 500);
  }
  const { data, error } = await admin
    .from("guide_health_checks")
    .insert({ employee_id: employee.id, photo_path: path })
    .select("id, uploaded_at")
    .single();
  if (error) {
    console.error(error);
    await admin.storage.from("health-checks").remove([path]);
    return guideJson(request, { error: "사진 저장 중 오류가 발생했습니다." }, 500);
  }
  return guideJson(request, { id: data.id, uploadedAt: data.uploaded_at });
}
