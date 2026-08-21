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

  // 이 시스템에 쓴 기록이 아직 없으면, 보관 중인 과거 서류에서 읽어낸 내용을
  // 대신 불러옵니다(요구사항 2). 추정값이라 화면에서 출처를 밝히고 확인을
  // 요청하며, 저장 전까지는 정식 기록이 아닙니다.
  let priorDocument: { filename: string; date: string | null; responses: Record<string, unknown> } | null =
    null;
  if (!previous) {
    const { data: doc } = await supabase
      .from("care_documents")
      .select("filename, document_date, extracted_responses, created_at")
      .eq("care_recipient_id", id)
      .eq("extraction_status", "done")
      .not("extracted_responses", "is", null)
      // 가장 최근 상태를 이어받아야 하므로 서류에 적힌 작성일을 우선합니다.
      .order("document_date", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (doc?.extracted_responses && Object.keys(doc.extracted_responses).length > 0) {
      priorDocument = {
        filename: doc.filename,
        date: doc.document_date,
        responses: doc.extracted_responses as Record<string, unknown>,
      };
    }
  }

  return (
    <>
      <TopBar
        name={profile.name}
        roleLabel={profile.role === "admin" ? "관리자" : "사회복지사"}
      />
      <AssessmentEditor
        recipientId={recipient.id}
        recipientName={recipient.name}
        initialResponses={previous?.responses ?? priorDocument?.responses ?? undefined}
        previousRoundNo={previous?.round_no}
        priorDocument={
          priorDocument ? { filename: priorDocument.filename, date: priorDocument.date } : undefined
        }
      />
    </>
  );
}
