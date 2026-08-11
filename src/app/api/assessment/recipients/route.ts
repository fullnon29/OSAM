import { NextResponse } from "next/server";
import { requireSocialWorker } from "@/lib/require-social-worker";

export async function POST(request: Request) {
  const result = await requireSocialWorker();
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  const { admin, profile } = result;

  const body = await request.json();
  const name = String(body.name ?? "").trim();
  if (!name) {
    return NextResponse.json({ error: "성명은 필수입니다." }, { status: 400 });
  }

  const { data, error } = await admin
    .from("care_recipients")
    .insert({
      name,
      birth_date: body.birth_date || null,
      gender: body.gender || null,
      ltc_grade: body.ltc_grade || null,
      ltc_number: body.ltc_number || null,
      address: body.address || null,
      guardian_name: body.guardian_name || null,
      guardian_phone: body.guardian_phone || null,
      memo: body.memo || null,
      created_by: profile.id,
    })
    .select()
    .single();

  if (error) {
    console.error(error);
    return NextResponse.json({ error: "수급자 등록 중 오류가 발생했습니다." }, { status: 500 });
  }

  return NextResponse.json({ recipient: data });
}
