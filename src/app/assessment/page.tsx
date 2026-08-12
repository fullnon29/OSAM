import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import TopBar from "@/components/training/TopBar";
import RecipientsBoard, { type Recipient } from "@/components/assessment/RecipientsBoard";

export default async function AssessmentHome() {
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
  if (profile.role !== "social_worker" && profile.role !== "admin") redirect("/training");

  const { data: recipients } = await supabase
    .from("care_recipients")
    .select("id, name, birth_date, gender, ltc_grade, is_active")
    .order("name");

  return (
    <>
      <TopBar
        name={profile.name}
        roleLabel={profile.role === "admin" ? "관리자" : "사회복지사"}
      />
      <RecipientsBoard recipients={(recipients ?? []) as Recipient[]} />
    </>
  );
}
