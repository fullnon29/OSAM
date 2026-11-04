import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import TopBar from "@/components/training/TopBar";
import ScheduleAdminBoard, { type ScheduleRow, type StaffOption } from "@/components/training/ScheduleAdminBoard";

export default async function ScheduleAdminPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/training/login");

  const { data: profile } = await supabase.from("profiles").select("id, role").eq("id", user.id).single();
  if (!profile) redirect("/training/login");
  if (profile.role !== "admin") redirect("/training");

  const { data: employees } = await supabase
    .from("profiles")
    .select("id, name, dept")
    .in("role", ["employee", "social_worker"])
    .eq("is_active", true)
    .order("name");
  const { data: devices } = await supabase.from("guide_devices").select("employee_id").is("revoked_at", null);
  const linked = new Set((devices ?? []).map((d) => d.employee_id));
  const staff: StaffOption[] = (employees ?? []).map((e) => ({ id: e.id, name: e.name, dept: e.dept ?? "", app: linked.has(e.id) }));

  const { data: schedules } = await supabase
    .from("guide_schedules")
    .select("id, month, file_name, page_count, created_at")
    .order("month", { ascending: false })
    .limit(24);
  const rows: ScheduleRow[] = [];
  for (const s of schedules ?? []) {
    const { count: visits } = await supabase
      .from("guide_schedule_visits")
      .select("id", { count: "exact", head: true })
      .eq("schedule_id", s.id);
    const { count: matched } = await supabase
      .from("guide_schedule_visits")
      .select("id", { count: "exact", head: true })
      .eq("schedule_id", s.id)
      .not("employee_id", "is", null);
    rows.push({ ...s, visits: visits ?? 0, matched: matched ?? 0 });
  }

  return (
    <>
      <TopBar name="시설장 (관리자)" roleLabel="관리자" />
      <ScheduleAdminBoard schedules={rows} staff={staff} />
    </>
  );
}
