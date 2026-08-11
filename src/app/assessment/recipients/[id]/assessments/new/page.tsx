import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import TopBar from "@/components/training/TopBar";
import AssessmentEditor from "@/components/assessment/AssessmentEditor";

export default async function NewAssessmentPage({
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
  if (profile.role !== "social_worker") redirect("/training");

  const { data: recipient } = await supabase
    .from("care_recipients")
    .select("id, name")
    .eq("id", id)
    .maybeSingle();
  if (!recipient) notFound();

  return (
    <>
      <TopBar name={profile.name} roleLabel="사회복지사" />
      <AssessmentEditor recipientId={recipient.id} recipientName={recipient.name} />
    </>
  );
}
