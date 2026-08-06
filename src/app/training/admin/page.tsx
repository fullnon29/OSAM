import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import TopBar from "@/components/training/TopBar";
import AdminBoard, {
  type AdminCompletion,
  type AdminEmployee,
  type AdminCourse,
  type AdminLog,
} from "@/components/training/AdminBoard";

export default async function AdminPage() {
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
  if (profile.role !== "admin") redirect("/training");

  const { data: courses } = await supabase
    .from("courses")
    .select("id, name")
    .eq("is_active", true)
    .order("sort_order");

  const { data: employees } = await supabase
    .from("profiles")
    .select("id, name, dept")
    .eq("role", "employee")
    .eq("is_active", true)
    .order("name");

  const { data: completions } = await supabase
    .from("course_completions")
    .select("employee_id, course_id, completed_at, cert_no");

  const { data: logs } = await supabase
    .from("completion_edit_logs")
    .select(
      "id, original_time, new_time, reason, edited_at, employee:profiles!completion_edit_logs_employee_id_fkey(name), course:courses(name)"
    )
    .order("edited_at", { ascending: false })
    .limit(30);

  return (
    <>
      <TopBar name="시설장 (관리자)" roleLabel="관리자" />
      <AdminBoard
        courses={(courses ?? []) as AdminCourse[]}
        employees={(employees ?? []) as AdminEmployee[]}
        completions={(completions ?? []) as AdminCompletion[]}
        logs={(logs ?? []) as unknown as AdminLog[]}
      />
    </>
  );
}
