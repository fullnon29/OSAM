import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";

// 관리자: 직원별로 연결된 앱(폰) 목록 / 연결 해제(폰 분실·퇴사 시)
export async function GET(request: Request) {
  const result = await requireAdmin();
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  const employeeId = new URL(request.url).searchParams.get("employeeId");
  const { data } = await result.admin
    .from("guide_devices")
    .select("id, device_info, created_at, last_seen_at")
    .eq("employee_id", employeeId)
    .is("revoked_at", null)
    .order("created_at", { ascending: false });
  return NextResponse.json({ devices: data ?? [] });
}

export async function POST(request: Request) {
  const result = await requireAdmin();
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  const { employeeId } = await request.json();
  const { error } = await result.admin
    .from("guide_devices")
    .update({ revoked_at: new Date().toISOString() })
    .eq("employee_id", employeeId)
    .is("revoked_at", null);
  if (error) {
    return NextResponse.json({ error: "해제 중 오류가 발생했습니다." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
