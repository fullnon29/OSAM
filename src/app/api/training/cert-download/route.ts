import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const courseId = searchParams.get("courseId");
  const targetEmployeeId = searchParams.get("employeeId") || user.id;
  if (!courseId) {
    return NextResponse.json({ error: "courseId가 필요합니다." }, { status: 400 });
  }

  const admin = createAdminClient();

  if (targetEmployeeId !== user.id) {
    const { data: profile } = await admin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    if (profile?.role !== "admin") {
      return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
    }
  }

  const path = `${targetEmployeeId}/${courseId}.pdf`;
  const { data, error } = await admin.storage
    .from("certificates")
    .createSignedUrl(path, 120);
  if (error || !data) {
    return NextResponse.json({ error: "수료증을 찾을 수 없습니다." }, { status: 404 });
  }

  return NextResponse.redirect(data.signedUrl);
}
