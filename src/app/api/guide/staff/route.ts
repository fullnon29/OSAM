import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/require-admin";
import { loadCares, normBirth, normPhone } from "@/lib/guide";

// 관리자: 직원 한 명의 정보(가입일·생년월일·전화번호 등), 담당 어르신·주의점, 건강검진 사진, 연결된 앱
export async function GET(request: Request) {
  const result = await requireAdmin();
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  const { admin } = result;
  const employeeId = new URL(request.url).searchParams.get("employeeId") ?? "";
  const { data: p } = await admin
    .from("profiles")
    .select("name, dept, hired_at, is_active, birth_yymmdd, phone, registered_via, created_at")
    .eq("id", employeeId)
    .single();
  if (!p) return NextResponse.json({ error: "직원을 찾을 수 없습니다." }, { status: 404 });
  const { data: devices } = await admin
    .from("guide_devices")
    .select("link_method, created_at, last_seen_at")
    .eq("employee_id", employeeId)
    .is("revoked_at", null)
    .order("created_at", { ascending: false });
  const { data: checks } = await admin
    .from("guide_health_checks")
    .select("id, photo_path, uploaded_at")
    .eq("employee_id", employeeId)
    .order("uploaded_at", { ascending: false });
  const healthChecks = [];
  for (const c of checks ?? []) {
    const { data: s } = await admin.storage.from("health-checks").createSignedUrl(c.photo_path, 600);
    healthChecks.push({ id: c.id, uploadedAt: c.uploaded_at, url: s?.signedUrl ?? null });
  }
  return NextResponse.json({
    name: p.name,
    dept: p.dept ?? "",
    hiredAt: p.hired_at ?? "",
    isActive: p.is_active,
    birth: p.birth_yymmdd ?? "",
    phone: p.phone ?? "",
    registeredVia: p.registered_via,
    createdAt: p.created_at,
    cares: await loadCares(admin, employeeId),
    devices: devices ?? [],
    healthChecks,
  });
}

// 저장소 폴더(직원 id) 아래 파일을 모두 지운다
async function removeFolder(admin: SupabaseClient, bucket: string, folder: string) {
  const { data } = await admin.storage.from(bucket).list(folder, { limit: 1000 });
  const paths = (data ?? []).map((f) => `${folder}/${f.name}`);
  if (paths.length) await admin.storage.from(bucket).remove(paths);
}

// 관리자: 직원 정보 고치기 / 완전 삭제
// body: { employeeId, action: 'update', name, dept, hiredAt, birth, phone, isActive } | { employeeId, action: 'delete' }
export async function POST(request: Request) {
  const result = await requireAdmin();
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  const { admin } = result;
  const body = await request.json();
  const employeeId = String(body.employeeId ?? "");

  const { data: target } = await admin.from("profiles").select("id, role").eq("id", employeeId).single();
  if (!target) return NextResponse.json({ error: "직원을 찾을 수 없습니다." }, { status: 404 });
  if (target.role === "admin") return NextResponse.json({ error: "관리자 계정은 여기서 고칠 수 없습니다." }, { status: 400 });

  if (body.action === "delete") {
    // 프로필을 먼저 지운다: 다른 기록(수정 이력, 작성한 욕구사정 등)이 이 직원을 가리키면 여기서 막히고 아무것도 지워지지 않는다.
    const { error: delError } = await admin.from("profiles").delete().eq("id", employeeId);
    if (delError) {
      console.error(delError);
      return NextResponse.json(
        { error: "이 직원을 가리키는 기록(수정 이력, 작성한 서류 등)이 있어 완전 삭제할 수 없습니다. 「퇴사 처리」를 써 주세요." },
        { status: 409 }
      );
    }
    await removeFolder(admin, "certificates", employeeId);
    await removeFolder(admin, "signatures", employeeId);
    await removeFolder(admin, "health-checks", employeeId);
    await admin.auth.admin.deleteUser(employeeId);
    return NextResponse.json({ ok: true, deleted: true });
  }

  const name = String(body.name ?? "").trim().replace(/\s+/g, " ").slice(0, 30);
  const birth = normBirth(body.birth);
  const phone = normPhone(body.phone);
  const hiredAt = String(body.hiredAt ?? "").trim();
  if (!name) return NextResponse.json({ error: "이름을 입력해 주세요." }, { status: 400 });
  if (birth && birth.length !== 6) return NextResponse.json({ error: "생년월일은 6자리(예: 650312)로 입력해 주세요." }, { status: 400 });
  if (phone && (phone.length < 10 || phone.length > 11)) return NextResponse.json({ error: "전화번호를 바르게 입력해 주세요." }, { status: 400 });
  if (hiredAt && !/^\d{4}-\d{2}-\d{2}$/.test(hiredAt)) return NextResponse.json({ error: "가입일을 바르게 입력해 주세요." }, { status: 400 });

  const { error } = await admin
    .from("profiles")
    .update({
      name,
      dept: String(body.dept ?? "").trim() || null,
      hired_at: hiredAt || null,
      birth_yymmdd: birth || null,
      phone: phone || null,
      is_active: body.isActive !== false,
    })
    .eq("id", employeeId);
  if (error) return NextResponse.json({ error: "저장 중 오류가 발생했습니다." }, { status: 500 });
  // 퇴사 처리하면 그 사람의 앱 연결도 끊는다
  if (body.isActive === false) {
    await admin.from("guide_devices").update({ revoked_at: new Date().toISOString() }).eq("employee_id", employeeId).is("revoked_at", null);
  }
  return NextResponse.json({ ok: true });
}
