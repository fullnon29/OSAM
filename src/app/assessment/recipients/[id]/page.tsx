import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import TopBar from "@/components/training/TopBar";
import RecipientDetailBoard from "@/components/assessment/RecipientDetailBoard";
import type { CareDocument } from "@/components/assessment/RecipientDocuments";
import type { RiskRecord } from "@/components/assessment/RecipientRiskHistory";

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

  // 이 어르신의 보관 서류(요구사항 0·1·3)
  const { data: documents } = await supabase
    .from("care_documents")
    .select("id, filename, doc_types, ext, byte_size, created_at")
    .eq("care_recipient_id", id)
    .order("created_at", { ascending: false });

  // 보관 서류에서 읽어낸 낙상·욕창 위험도 평가(요구사항 10)
  const { data: riskRecords } = await supabase
    .from("care_documents")
    .select("id, filename, risk_assessments")
    .eq("care_recipient_id", id)
    .not("risk_assessments", "is", null);

  return (
    <>
      <TopBar
        name={profile.name}
        roleLabel={profile.role === "admin" ? "관리자" : "사회복지사"}
      />
      <RecipientDetailBoard
        recipient={recipient}
        assessments={assessments ?? []}
        documents={(documents ?? []) as CareDocument[]}
        riskRecords={(riskRecords ?? []) as RiskRecord[]}
      />
    </>
  );
}
