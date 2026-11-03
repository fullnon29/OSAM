import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "./supabase/admin";

// 「평가 길잡이」 앱(별도 APK) 연동.
// 앱은 osamcare.com 쿠키를 쓰지 않고, 관리자가 띄운 QR 로 받은 기기 토큰을 Authorization 헤더로 보낸다.

// 앱(Capacitor: https://localhost)과 로컬 미리보기에서만 호출을 허용한다.
const APP_ORIGINS = new Set([
  "https://localhost",
  "capacitor://localhost",
  "http://localhost",
  "http://localhost:8124",
]);

export function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("origin") ?? "";
  if (!APP_ORIGINS.has(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export function guideJson(request: Request, body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: corsHeaders(request) });
}

export function guidePreflight(request: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request) });
}

export function sha256(text: string) {
  return createHash("sha256").update(text).digest("hex");
}

// QR 에 담는 1회용 연결 코드. 헷갈리는 글자(0/O, 1/I/L)는 뺀다.
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export function newLinkCode() {
  const bytes = randomBytes(8);
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}
export const QR_PREFIX = "OSAMGUIDE:";
export const LINK_CODE_MINUTES = 10;

export function newDeviceToken() {
  return randomBytes(32).toString("base64url");
}

export type GuideEmployee = { id: string; name: string; deviceId: string };

// Authorization: Bearer <기기 토큰> → 연결된 직원. 해제됐거나 퇴사(비활성)면 null.
export async function employeeFromRequest(
  request: Request
): Promise<{ admin: SupabaseClient; employee: GuideEmployee } | null> {
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token) return null;

  const admin = createAdminClient();
  const { data: device } = await admin
    .from("guide_devices")
    .select("id, employee_id, revoked_at, profile:profiles(id, name, is_active)")
    .eq("token_hash", sha256(token))
    .maybeSingle();
  const profile = device?.profile as unknown as { id: string; name: string; is_active: boolean } | null;
  if (!device || device.revoked_at || !profile?.is_active) return null;

  await admin.from("guide_devices").update({ last_seen_at: new Date().toISOString() }).eq("id", device.id);
  return { admin, employee: { id: profile.id, name: profile.name, deviceId: device.id } };
}

// ───── 앱이 이수하는 과정 ─────
// 앱은 'rules'(운영규정) 또는 'onboard-N'(신규입문 N단계)만 보내고,
// 실제 과정(연도·반기)은 서버 시각으로 정한다. 과정이 없으면 만든다.

export const ONBOARD_STEPS: Record<number, { title: string; content: string }> = {
  1: { title: "첫 근무 전 서류", content: "건강검진 결과통보서(결핵 포함) 제출, 근로계약서 작성(보수·소정근로시간·휴일·연차), 자격증 사본 제출, 보수교육 대상 연도 확인" },
  3: { title: "급여제공 시작 7일 이내 교육", content: "급여제공지침 12개 항목(감염예방·욕창예방 포함), 노인인권교육(권리보호·학대 유형·예방·대응), 「직원」 인권침해 대응지침, 응급상황 대처법, 비상연락망" },
  4: { title: "첫 방문 전 준비", content: "담당 수급자 인계인수(건강상태·생활환경·특이사항), 급여제공계획 설명 청취(기능상태·유의사항), 서비스 시간·급여 외 행위 범위, RFID 태그 사용법" },
  5: { title: "첫 주 실무", content: "방문 체크리스트에 따른 서비스, 상태변화 기록 주 1회 이상, 기관 보고 체계" },
  6: { title: "평가 대비 면담 연습", content: "응급상황 대처, 낙상 요인·예방, 치매 증상, 급여제공계획 숙지, 계획 변경 요청, 노인학대 유형·신고" },
};

function kstNow() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit" })
    .formatToParts(new Date());
  return {
    year: Number(parts.find((p) => p.type === "year")?.value),
    month: Number(parts.find((p) => p.type === "month")?.value),
  };
}

export function guideCourseSpec(kind: string) {
  const { year, month } = kstNow();
  if (kind === "rules") {
    const half = month <= 6 ? 1 : 2;
    return {
      guide_key: `rules-${year}-H${half}`,
      year,
      name: `${year} ${half === 1 ? "상반기" : "하반기"} 운영규정 교육`,
      category: "운영규정",
      method: "자체교육 (평가 길잡이 앱 운영규정 전문 열람)",
      content: "오샘재가복지센터 운영규정 전문 (운영규정 11개 항목: 이용자 모집, 이용계약, 비용 변경, 서비스 내용·비용, 배상책임·면책, 규정 개정, 인력관리, 보수, 복리후생, 안전과 보건, 고충처리 절차)",
      sort_order: 900 + half,
    };
  }
  const m = /^onboard-(\d)$/.exec(kind);
  const step = m ? ONBOARD_STEPS[Number(m[1])] : undefined;
  if (m && step) {
    return {
      guide_key: kind,
      year,
      name: `신규입문 ${m[1]}단계: ${step.title}`,
      category: "신규입문",
      method: "자체교육 (평가 길잡이 앱)",
      content: step.content,
      sort_order: 950 + Number(m[1]),
    };
  }
  return null;
}

export async function ensureGuideCourse(admin: SupabaseClient, kind: string) {
  const spec = guideCourseSpec(kind);
  if (!spec) return null;
  const { data: found } = await admin
    .from("courses")
    .select("id, name, instructor")
    .eq("guide_key", spec.guide_key)
    .maybeSingle();
  if (found) return found;
  const { data: created, error } = await admin
    .from("courses")
    .insert({ ...spec, is_required: true, is_active: true, description: `${spec.category} · 평가 길잡이 앱에서 서명으로 이수합니다.` })
    .select("id, name, instructor")
    .single();
  if (error) throw error;
  return created;
}

// data:image/png;base64,... → 바이트. 비었거나 너무 크면 null.
export function decodeSignature(dataUrl: unknown): Uint8Array | null {
  if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/png;base64,")) return null;
  const bytes = Buffer.from(dataUrl.slice("data:image/png;base64,".length), "base64");
  if (bytes.length < 200 || bytes.length > 400_000) return null;
  return new Uint8Array(bytes);
}
