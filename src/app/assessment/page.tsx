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
    .select("id, name, birth_date, gender, ltc_grade, ltc_number, guardian_name, is_active")
    .order("name");

  // 목록에서 어르신별 보유 서류와 욕구사정 진행 상황을 함께 보여줍니다.
  // 건수만 필요하므로 식별자 열만 가져와 세어 씁니다.
  //
  // 한 번의 조회로는 1,000행까지만 돌아오므로(서류가 1,700건이 넘습니다)
  // 끝까지 나눠 받습니다. 그러지 않으면 뒷부분 어르신의 서류가 0건으로 보입니다.
  const PAGE = 1000;
  const docRows: { care_recipient_id: string }[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data } = await supabase
      .from("care_documents")
      .select("care_recipient_id")
      .not("care_recipient_id", "is", null)
      .range(from, from + PAGE - 1);
    const batch = (data ?? []) as { care_recipient_id: string }[];
    docRows.push(...batch);
    if (batch.length < PAGE) break;
  }

  const { data: assessRows } = await supabase
    .from("needs_assessments")
    .select("care_recipient_id, assessed_at");

  const documentCounts: Record<string, number> = {};
  for (const row of docRows) {
    const key = row.care_recipient_id;
    documentCounts[key] = (documentCounts[key] ?? 0) + 1;
  }

  const assessmentInfo: Record<string, { count: number; latest: string | null }> = {};
  for (const row of assessRows ?? []) {
    const key = row.care_recipient_id as string;
    const prev = assessmentInfo[key] ?? { count: 0, latest: null };
    assessmentInfo[key] = {
      count: prev.count + 1,
      latest:
        !prev.latest || (row.assessed_at && row.assessed_at > prev.latest)
          ? (row.assessed_at as string | null)
          : prev.latest,
    };
  }

  return (
    <>
      <TopBar
        name={profile.name}
        roleLabel={profile.role === "admin" ? "관리자" : "사회복지사"}
      />
      <RecipientsBoard
        recipients={(recipients ?? []) as Recipient[]}
        documentCounts={documentCounts}
        assessmentInfo={assessmentInfo}
      />
    </>
  );
}
