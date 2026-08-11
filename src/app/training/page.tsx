import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import TopBar from "@/components/training/TopBar";
import CourseBoard, {
  type CompletionMap,
} from "@/components/training/CourseBoard";

export default async function TrainingHome() {
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
  if (profile.role === "admin") redirect("/training/admin");

  const { data: courses } = await supabase
    .from("courses")
    .select("id, name, category, duration_min")
    .eq("is_active", true)
    .order("sort_order");

  const { data: completions } = await supabase
    .from("course_completions")
    .select("course_id, completed_at, cert_no")
    .eq("employee_id", profile.id);

  const completionMap: CompletionMap = {};
  for (const c of completions ?? []) {
    completionMap[c.course_id] = {
      completed_at: c.completed_at,
      cert_no: c.cert_no,
    };
  }

  const roleLabel = profile.role === "social_worker" ? "사회복지사" : "종사자";

  return (
    <>
      <TopBar name={profile.name} roleLabel={roleLabel} />
      <CourseBoard
        employeeName={profile.name}
        courses={courses ?? []}
        completions={completionMap}
      />
    </>
  );
}
