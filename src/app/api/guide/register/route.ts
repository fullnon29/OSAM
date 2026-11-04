import { createAdminClient } from "@/lib/supabase/admin";
import {
  cleanCares,
  clientIp,
  guideJson,
  guidePreflight,
  newDeviceToken,
  normBirth,
  normName,
  normPhone,
  saveCares,
  sha256,
} from "@/lib/guide";

export const OPTIONS = guidePreflight;

const MAX_FAILS = 5;       // 같은 곳에서 30분 안에 5번 틀리면
const FAIL_WINDOW_MIN = 30; // 30분 동안 막는다

// 앱 최초 실행: 성함·생년월일·전화번호가 센터 등록 정보와 맞으면 연결하고, 담당 어르신을 저장한다.
// body: { name, birth(yymmdd), phone, cares: [{ elderName, cautions }], consent: true, deviceInfo }
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  if (body.consent !== true) return guideJson(request, { error: "개인정보 수집·이용에 동의해 주세요." }, 400);

  const name = normName(body.name);
  const birth = normBirth(body.birth);
  const phone = normPhone(body.phone);
  if (!name || birth.length !== 6 || phone.length < 10) {
    return guideJson(request, { error: "성함, 생년월일 6자리, 전화번호를 바르게 입력해 주세요." }, 400);
  }

  const admin = createAdminClient();
  const ip = clientIp(request);
  const since = new Date(Date.now() - FAIL_WINDOW_MIN * 60_000).toISOString();
  const { count: fails } = await admin
    .from("guide_link_attempts")
    .select("*", { count: "exact", head: true })
    .eq("ip", ip)
    .eq("ok", false)
    .gte("created_at", since);
  if ((fails ?? 0) >= MAX_FAILS) {
    return guideJson(request, { error: `여러 번 맞지 않아 ${FAIL_WINDOW_MIN}분 동안 막혔습니다. 사무실에 문의하시거나 QR로 연결해 주세요.` }, 429);
  }

  const { data: candidates } = await admin
    .from("profiles")
    .select("id, name")
    .eq("birth_yymmdd", birth)
    .eq("phone", phone)
    .eq("is_active", true)
    .in("role", ["employee", "social_worker"]);
  const match = (candidates ?? []).filter((p) => normName(p.name) === name);

  if (match.length !== 1) {
    await admin.from("guide_link_attempts").insert({ ip, ok: false });
    return guideJson(request, {
      error: "센터에 등록된 정보와 맞지 않습니다. 성함·생년월일·전화번호를 다시 확인하시거나 사무실에 문의해 주세요.",
    }, 404);
  }
  const employee = match[0];

  const token = newDeviceToken();
  const { error } = await admin.from("guide_devices").insert({
    employee_id: employee.id,
    token_hash: sha256(token),
    device_info: String(body.deviceInfo ?? "").slice(0, 300) || null,
    link_method: "info",
    last_seen_at: new Date().toISOString(),
  });
  if (error) {
    console.error(error);
    return guideJson(request, { error: "연결 중 오류가 발생했습니다." }, 500);
  }
  await admin.from("guide_link_attempts").insert({ ip, ok: true, employee_id: employee.id });

  const cares = cleanCares(body.cares);
  try {
    if (cares.length) await saveCares(admin, employee.id, cares);
  } catch (err) {
    console.error(err);
    return guideJson(request, { token, name: employee.name, warning: "연결은 되었지만 담당 어르신 저장에 실패했습니다. 「내 정보」에서 다시 저장해 주세요." });
  }
  return guideJson(request, { token, name: employee.name });
}
