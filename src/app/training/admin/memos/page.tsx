import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import TopBar from "@/components/training/TopBar";
import MemosAdminBoard, { type AdminMemo, type AdminAlertDay } from "@/components/training/MemosAdminBoard";

export default async function MemosAdminPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/training/login");

  const { data: profile } = await supabase.from("profiles").select("id, role").eq("id", user.id).single();
  if (!profile) redirect("/training/login");
  if (profile.role !== "admin") redirect("/training");

  const { data: people } = await supabase.from("profiles").select("id, name");
  const nameOf = new Map((people ?? []).map((p) => [p.id as string, String(p.name)]));

  const { data: memos } = await supabase
    .from("guide_memos")
    .select("id, employee_id, elder_name, body, created_at, read_at")
    .order("created_at", { ascending: false })
    .limit(200);
  const memoList: AdminMemo[] = (memos ?? []).map((m) => ({
    id: m.id,
    staff: nameOf.get(m.employee_id) ?? "(알 수 없음)",
    elder: m.elder_name,
    body: m.body,
    createdAt: m.created_at,
    read: !!m.read_at,
  }));

  const { data: alerts } = await supabase
    .from("guide_alerts")
    .select("employee_id, alert_date, acked_at, push_sent_at, push_result")
    .eq("kind", "offday")
    .order("alert_date", { ascending: false })
    .limit(2000);
  const days = new Map<string, AdminAlertDay>();
  for (const a of alerts ?? []) {
    const d: AdminAlertDay = days.get(a.alert_date) ?? { date: a.alert_date, total: 0, pushed: 0, acked: 0, unacked: [], noPush: [] };
    const name = nameOf.get(a.employee_id) ?? "(알 수 없음)";
    d.total++;
    if (a.push_sent_at) d.pushed++;
    else d.noPush.push(name);
    if (a.acked_at) d.acked++;
    else d.unacked.push(name);
    days.set(a.alert_date, d);
  }

  return (
    <>
      <TopBar name="시설장 (관리자)" roleLabel="관리자" />
      <MemosAdminBoard memos={memoList} alertDays={[...days.values()].slice(0, 12)} />
    </>
  );
}
