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
  if (profile.role !== "social_worker" && profile.role !== "admin") redirect("/training");

  const { data: recipient } = await supabase
    .from("care_recipients")
    .select("id, name")
    .eq("id", id)
    .maybeSingle();
  if (!recipient) notFound();

  const { data: previous } = await supabase
    .from("needs_assessments")
    .select("round_no, responses")
    .eq("care_recipient_id", id)
    .order("round_no", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (
    <>
      <TopBar
        name={profile.name}
        roleLabel={profile.role === "admin" ? "관리자" : "사회복지사"}
      />
      <AssessmentEditor
        recipientId={recipient.id}
        recipientName={recipient.name}
        initialResponses={previous?.responses ?? undefined}
        previousRoundNo={previous?.round_no}
      />
    </>
  );
}
