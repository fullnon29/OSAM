import { NextResponse } from "next/server";
import { requireSocialWorker } from "@/lib/require-social-worker";

/** 빈 칸으로 지운 것과 아예 안 보낸 것을 구분합니다. */
function text(value: unknown) {
  if (value === undefined) return undefined;
  const trimmed = String(value ?? "").trim();
  return trimmed || null;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireSocialWorker();
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  const { admin } = result;
  const { id } = await params;

  const body = await request.json();

  const name = text(body.name);
  if (name === null) {
    return NextResponse.json({ error: "성명은 비울 수 없습니다." }, { status: 400 });
  }

  const gender = text(body.gender);
  if (gender && gender !== "M" && gender !== "F") {
    return NextResponse.json({ error: "성별 값이 올바르지 않습니다." }, { status: 400 });
  }

  const patch: Record<string, unknown> = {
    name,
    // 날짜는 빈 칸이면 null 로 지웁니다. 빈 문자열은 date 칼럼이 받지 않습니다.
    birth_date: body.birth_date === undefined ? undefined : body.birth_date || null,
    gender,
    ltc_grade: text(body.ltc_grade),
    ltc_number: text(body.ltc_number),
    address: text(body.address),
    guardian_name: text(body.guardian_name),
    guardian_phone: text(body.guardian_phone),
    memo: text(body.memo),
    is_active: typeof body.is_active === "boolean" ? body.is_active : undefined,
  };
  for (const key of Object.keys(patch)) {
    if (patch[key] === undefined) delete patch[key];
  }

  const { data, error } = await admin
    .from("care_recipients")
    .update(patch)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error(error);
    return NextResponse.json(
      { error: "어르신 정보 수정 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }

  return NextResponse.json({ recipient: data });
}
