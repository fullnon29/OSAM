import { createAdminClient } from "@/lib/supabase/admin";
import { guideJson, guidePreflight, newDeviceToken, sha256, QR_PREFIX } from "@/lib/guide";

export const OPTIONS = guidePreflight;

// 앱이 QR(또는 코드 입력)로 받은 1회용 코드를 기기 토큰으로 바꾼다.
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const raw = String(body.code ?? "").trim().toUpperCase();
  const code = raw.startsWith(QR_PREFIX) ? raw.slice(QR_PREFIX.length) : raw.replace(/[^0-9A-Z]/g, "");
  if (code.length !== 8) return guideJson(request, { error: "연결 코드가 올바르지 않습니다." }, 400);

  const admin = createAdminClient();
  const { data: link } = await admin
    .from("guide_link_codes")
    .select("id, employee_id, expires_at, used_at, profile:profiles!guide_link_codes_employee_id_fkey(name, is_active)")
    .eq("code_hash", sha256(code))
    .maybeSingle();
  const profile = link?.profile as unknown as { name: string; is_active: boolean } | null;
  if (!link || !profile?.is_active) return guideJson(request, { error: "연결 코드를 찾을 수 없습니다. 사무실에 새 QR을 요청해 주세요." }, 404);
  if (link.used_at) return guideJson(request, { error: "이미 사용한 QR입니다. 사무실에 새 QR을 요청해 주세요." }, 410);
  if (new Date(link.expires_at) < new Date()) return guideJson(request, { error: "QR 유효시간(10분)이 지났습니다. 사무실에 새 QR을 요청해 주세요." }, 410);

  // 먼저 코드를 사용 처리해서 같은 코드로 두 기기가 연결되지 않게 한다.
  const { data: claimed } = await admin
    .from("guide_link_codes")
    .update({ used_at: new Date().toISOString() })
    .eq("id", link.id)
    .is("used_at", null)
    .select("id");
  if (!claimed?.length) return guideJson(request, { error: "이미 사용한 QR입니다." }, 410);

  const token = newDeviceToken();
  const { error } = await admin.from("guide_devices").insert({
    employee_id: link.employee_id,
    token_hash: sha256(token),
    device_info: String(body.deviceInfo ?? "").slice(0, 300) || null,
    last_seen_at: new Date().toISOString(),
  });
  if (error) {
    console.error(error);
    return guideJson(request, { error: "연결 중 오류가 발생했습니다." }, 500);
  }
  return guideJson(request, { token, name: profile.name });
}
