import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { usernameToEmail } from "@/lib/auth";

export async function POST(request: Request) {
  const result = await requireAdmin();
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  const { admin } = result;

  const body = await request.json();
  const name = String(body.name ?? "").trim();
  const username = String(body.username ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const dept = body.dept ? String(body.dept).trim() : null;
  const hiredAt = body.hired_at ? String(body.hired_at) : null;

  if (!name || !username || !password) {
    return NextResponse.json(
      { error: "이름, 아이디, 초기 비밀번호는 필수입니다." },
      { status: 400 }
    );
  }
  if (password.length < 6) {
    return NextResponse.json(
      { error: "비밀번호는 6자 이상이어야 합니다." },
      { status: 400 }
    );
  }
  if (!/^[a-z0-9_.-]+$/.test(username)) {
    return NextResponse.json(
      { error: "아이디는 영문 소문자, 숫자, ., -, _ 만 사용할 수 있습니다." },
      { status: 400 }
    );
  }

  const { data: existing } = await admin
    .from("profiles")
    .select("id")
    .eq("employee_no", username)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ error: "이미 사용 중인 아이디입니다." }, { status: 409 });
  }

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: usernameToEmail(username),
    password,
    email_confirm: true,
  });
  if (createError || !created.user) {
    const message =
      createError?.code === "email_exists"
        ? "이미 사용 중인 아이디입니다."
        : "계정 생성 중 오류가 발생했습니다.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .insert({
      id: created.user.id,
      employee_no: username,
      name,
      dept,
      hired_at: hiredAt,
      role: "employee",
      is_active: true,
    })
    .select()
    .single();

  if (profileError) {
    // 프로필 생성이 실패하면 방금 만든 인증 계정도 함께 되돌립니다.
    await admin.auth.admin.deleteUser(created.user.id);
    return NextResponse.json(
      { error: "직원 정보 저장 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }

  return NextResponse.json({ profile });
}
