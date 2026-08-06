import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import TopBar from "@/components/training/TopBar";
import CourseDetail from "@/components/training/CourseDetail";

export default async function CourseDetailPage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/training/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, name, role")
    .eq("id", user.id)
    .single();
  if (!profile) redirect("/training/login");

  const { data: course } = await supabase
    .from("courses")
    .select("id, name, category, description, duration_min, youtube_url, material_url")
    .eq("id", courseId)
    .single();
  if (!course) notFound();

  const { data: completion } = await supabase
    .from("course_completions")
    .select("completed_at, cert_no")
    .eq("employee_id", profile.id)
    .eq("course_id", courseId)
    .maybeSingle();

  return (
    <>
      <TopBar name={profile.name} roleLabel={profile.role === "admin" ? "관리자" : "종사자"} />
      <CourseDetail
        course={course}
        employeeName={profile.name}
        alreadyDone={completion ?? null}
      />
    </>
  );
}
