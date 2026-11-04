import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import TopBar from "@/components/training/TopBar";
import NoticesAdminBoard, { type AdminNotice } from "@/components/training/NoticesAdminBoard";

export default async function NoticesAdminPage() {
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

  const { data: notices } = await supabase
    .from("guide_notices")
    .select("id, title, body, link_url, requires_ack, is_active, created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  const { data: reads } = await supabase.from("guide_notice_reads").select("notice_id, employee_id, read_at");
  const { data: employees } = await supabase
    .from("profiles")
    .select("id, name")
    .in("role", ["employee", "social_worker"])
    .eq("is_active", true)
    .order("name");

  const list: AdminNotice[] = (notices ?? []).map((n) => {
    const readers = new Set((reads ?? []).filter((r) => r.notice_id === n.id).map((r) => r.employee_id));
    return {
      ...n,
      readCount: (employees ?? []).filter((e) => readers.has(e.id)).length,
      unread: (employees ?? []).filter((e) => !readers.has(e.id)).map((e) => e.name),
    };
  });

  return (
    <>
      <TopBar name="시설장 (관리자)" roleLabel="관리자" />
      <NoticesAdminBoard notices={list} total={(employees ?? []).length} />
    </>
  );
}
