import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordCompletion } from "@/lib/certificate";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const { courseId } = await request.json();
  if (!courseId) {
    return NextResponse.json({ error: "courseId가 필요합니다." }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id, name")
    .eq("id", user.id)
    .single();
  if (profileError || !profile) {
    return NextResponse.json({ error: "종사자 정보를 찾을 수 없습니다." }, { status: 404 });
  }

  const { data: course, error: courseError } = await admin
    .from("courses")
    .select("id, name")
    .eq("id", courseId)
    .single();
  if (courseError || !course) {
    return NextResponse.json({ error: "교육 과정을 찾을 수 없습니다." }, { status: 404 });
  }

  try {
    const completion = await recordCompletion(admin, {
      employeeId: profile.id,
      employeeName: profile.name,
      courseId: course.id,
      courseName: course.name,
    });
    return NextResponse.json({ completion });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "이수 처리 중 오류가 발생했습니다." }, { status: 500 });
  }
}
