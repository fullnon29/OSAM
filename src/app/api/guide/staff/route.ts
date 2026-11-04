import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { loadCares, normBirth, normPhone } from "@/lib/guide";

// 관리자: 직원 한 명의 앱 연결 정보(생년월일·전화번호)와 담당 어르신·주의점, 연결된 앱
export async function GET(request: Request) {
  const result = await requireAdmin();
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  const { admin } = result;
  const employeeId = new URL(request.url).searchParams.get("employeeId") ?? "";
  const { data: p } = await admin.from("profiles").select("birth_yymmdd, phone").eq("id", employeeId).single();
  const { data: devices } = await admin
    .from("guide_devices")
    .select("link_method, created_at, last_seen_at")
    .eq("employee_id", employeeId)
    .is("revoked_at", null)
    .order("created_at", { ascending: false });
  return NextResponse.json({
    birth: p?.birth_yymmdd ?? "",
    phone: p?.phone ?? "",
    cares: await loadCares(admin, employeeId),
    devices: devices ?? [],
  });
}

// 관리자: 생년월일·전화번호 등록 body: { employeeId, birth, phone }
export async function POST(request: Request) {
  const result = await requireAdmin();
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  const body = await request.json();
  const birth = normBirth(body.birth);
  const phone = normPhone(body.phone);
  if (birth && birth.length !== 6) return NextResponse.json({ error: "생년월일은 6자리(예: 650312)로 입력해 주세요." }, { status: 400 });
  if (phone && phone.length < 10) return NextResponse.json({ error: "전화번호를 바르게 입력해 주세요." }, { status: 400 });
  const { error } = await result.admin
    .from("profiles")
    .update({ birth_yymmdd: birth || null, phone: phone || null })
    .eq("id", body.employeeId);
  if (error) return NextResponse.json({ error: "저장 중 오류가 발생했습니다." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
