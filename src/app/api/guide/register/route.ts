import { randomBytes } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { STAFF_EMAIL_DOMAIN } from "@/lib/auth";
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

const MAX_SIGNUPS = 10;        // 같은 곳(인터넷 주소)에서 1시간에 새 가입은 10명까지
const SIGNUP_WINDOW_MIN = 60;

function kstToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date()); // YYYY-MM-DD
}

// 앱 최초 실행: 선생님이 현장에서 스스로 가입한다 (센터 사전 등록 불필요).
// 성함·생년월일·전화번호가 같은 직원이 이미 있으면 그 계정에 연결하고, 없으면 새 직원으로 등록한다.
// 명단 정리(중복·퇴사 삭제, 가입일 수정)는 관리자가 웹 「종사자 계정 관리」에서 한다.
// body: { name, birth(yymmdd), phone, cares: [{ elderName, cautions }], consent: true, deviceInfo }
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  if (body.consent !== true) return guideJson(request, { error: "개인정보 수집·이용에 동의해 주세요." }, 400);

  const displayName = String(body.name ?? "").trim().replace(/\s+/g, " ").slice(0, 30);
  const name = normName(displayName);
  const birth = normBirth(body.birth);
  const phone = normPhone(body.phone);
  if (!name || birth.length !== 6 || phone.length < 10 || phone.length > 11) {
    return guideJson(request, { error: "성함, 생년월일 6자리, 전화번호를 바르게 입력해 주세요." }, 400);
  }

  const admin = createAdminClient();
  const ip = clientIp(request);

  const { data: candidates } = await admin
    .from("profiles")
    .select("id, name")
    .eq("birth_yymmdd", birth)
    .eq("phone", phone)
    .eq("is_active", true)
    .in("role", ["employee", "social_worker", "admin"]); // 시설장도 앱을 쓰면 새 직원으로 만들지 않고 관리자 계정에 연결
  let match = (candidates ?? []).filter((p) => normName(p.name) === name);

  // 센터가 직원 명단(이름·전화번호만 있고 생년월일은 없음)으로 미리 등록해 둔 직원: 이름+전화번호가 같고
  // 생년월일이 비어 있으면 그 직원에 연결하고, 지금 입력한 생년월일을 저장한다(다음부터는 세 가지가 모두 같아야 연결).
  if (!match.length) {
    const { data: pre } = await admin
      .from("profiles")
      .select("id, name")
      .eq("phone", phone)
      .is("birth_yymmdd", null)
      .eq("is_active", true)
      .in("role", ["employee", "social_worker"]);
    const preMatch = (pre ?? []).filter((p) => normName(p.name) === name);
    if (preMatch.length === 1) {
      const { error: be } = await admin.from("profiles").update({ birth_yymmdd: birth }).eq("id", preMatch[0].id);
      if (!be) match = preMatch;
    }
  }

  let employee: { id: string; name: string };
  let created = false;
  if (match.length >= 1) {
    employee = match[0];
  } else {
    const since = new Date(Date.now() - SIGNUP_WINDOW_MIN * 60_000).toISOString();
    const { count } = await admin
      .from("guide_link_attempts")
      .select("*", { count: "exact", head: true })
      .eq("ip", ip)
      .eq("created_new", true)
      .gte("created_at", since);
    if ((count ?? 0) >= MAX_SIGNUPS) {
      return guideJson(request, { error: "이곳에서 가입이 너무 많아 잠시 막혔습니다. 1시간 뒤에 다시 하시거나 사무실에 문의해 주세요." }, 429);
    }

    // 웹 로그인용이 아닌 앱 전용 계정 (아이디·비밀번호는 쓰지 않음, 관리자가 나중에 정리)
    const { data: u, error: ue } = await admin.auth.admin.createUser({
      email: `app-${randomBytes(6).toString("hex")}@${STAFF_EMAIL_DOMAIN}`,
      password: randomBytes(24).toString("base64url"),
      email_confirm: true,
    });
    if (ue || !u.user) {
      console.error(ue);
      return guideJson(request, { error: "가입 중 오류가 발생했습니다. 잠시 뒤 다시 해 주세요." }, 500);
    }
    const { error: pe } = await admin.from("profiles").insert({
      id: u.user.id,
      name: displayName,
      role: "employee",
      is_active: true,
      birth_yymmdd: birth,
      phone,
      hired_at: kstToday(),
      registered_via: "app",
    });
    if (pe) {
      console.error(pe);
      await admin.auth.admin.deleteUser(u.user.id);
      return guideJson(request, { error: "가입 중 오류가 발생했습니다. 잠시 뒤 다시 해 주세요." }, 500);
    }
    employee = { id: u.user.id, name: displayName };
    created = true;
  }

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
  await admin.from("guide_link_attempts").insert({ ip, ok: true, employee_id: employee.id, created_new: created });

  const cares = cleanCares(body.cares);
  try {
    if (cares.length) await saveCares(admin, employee.id, cares);
  } catch (err) {
    console.error(err);
    return guideJson(request, { token, name: employee.name, created, warning: "연결은 되었지만 담당 어르신 저장에 실패했습니다. 「내 담당 어르신」에서 다시 저장해 주세요." });
  }
  return guideJson(request, { token, name: employee.name, created });
}
