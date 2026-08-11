import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import TopBar from "@/components/training/TopBar";
import EmployeesAdminBoard, {
  type Employee,
} from "@/components/training/EmployeesAdminBoard";

export default async function EmployeesAdminPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/training/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("id", user.id)
    .single();
  if (!profile) redirect("/training/login");
  if (profile.role !== "admin") redirect("/training");

  const { data: employees } = await supabase
    .from("profiles")
    .select("id, employee_no, name, dept, hired_at, is_active, created_at")
    .eq("role", "employee")
    .order("name");

  return (
    <>
      <TopBar name="시설장 (관리자)" roleLabel="관리자" />
      <EmployeesAdminBoard employees={(employees ?? []) as Employee[]} />
    </>
  );
}
