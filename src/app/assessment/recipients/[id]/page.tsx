import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import TopBar from "@/components/training/TopBar";
import RecipientDetailBoard from "@/components/assessment/RecipientDetailBoard";

export default async function RecipientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
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

  const { data: recipient } = await supabase
    .from("care_recipients")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!recipient) notFound();

  const { data: assessments } = await supabase
    .from("needs_assessments")
    .select("id, round_no, assessed_at, status, created_at")
    .eq("care_recipient_id", id)
    .order("round_no", { ascending: false });

  return (
    <>
      <TopBar
        name={profile.name}
        roleLabel={profile.role === "admin" ? "관리자" : "사회복지사"}
      />
      <RecipientDetailBoard recipient={recipient} assessments={assessments ?? []} />
    </>
  );
}
