import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { requireAdmin } from "@/lib/require-admin";
import { LINK_CODE_MINUTES, newLinkCode, QR_PREFIX, sha256 } from "@/lib/guide";

// 관리자: 직원 한 명의 「평가 길잡이」 앱 연결 QR(10분 유효, 1회용)을 만든다.
export async function POST(request: Request) {
  const result = await requireAdmin();
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  const { admin, adminProfile } = result;

  const { employeeId } = await request.json();
  const { data: employee } = await admin
    .from("profiles")
    .select("id, name, is_active")
    .eq("id", employeeId)
    .single();
  if (!employee?.is_active) {
    return NextResponse.json({ error: "직원을 찾을 수 없습니다." }, { status: 404 });
  }

  const code = newLinkCode();
  const expiresAt = new Date(Date.now() + LINK_CODE_MINUTES * 60_000).toISOString();
  const { error } = await admin.from("guide_link_codes").insert({
    code_hash: sha256(code),
    employee_id: employee.id,
    created_by: adminProfile.id,
    expires_at: expiresAt,
  });
  if (error) {
    console.error(error);
    return NextResponse.json({ error: "QR 생성 중 오류가 발생했습니다." }, { status: 500 });
  }

  const qr = await QRCode.toDataURL(QR_PREFIX + code, { width: 320, margin: 2 });
  return NextResponse.json({
    name: employee.name,
    code: `${code.slice(0, 4)}-${code.slice(4)}`,
    qr,
    expiresAt,
  });
}
