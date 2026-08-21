import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import TopBar from "@/components/training/TopBar";
import UnmatchedDocumentsBoard, {
  type UnmatchedDocument,
  type RecipientOption,
} from "@/components/assessment/UnmatchedDocumentsBoard";

export default async function UnmatchedDocumentsPage() {
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

  const [{ data: documents }, { data: recipients }] = await Promise.all([
    supabase
      .from("care_documents")
      .select("id, filename, doc_types, ext, extracted_name, extracted_ltc_grade")
      .is("care_recipient_id", null)
      .order("extracted_name", { nullsFirst: false }),
    supabase
      .from("care_recipients")
      .select("id, name, ltc_grade, ltc_number")
      .order("name"),
  ]);

  return (
    <>
      <TopBar
        name={profile.name}
        roleLabel={profile.role === "admin" ? "관리자" : "사회복지사"}
      />
      <UnmatchedDocumentsBoard
        documents={(documents ?? []) as UnmatchedDocument[]}
        recipients={(recipients ?? []) as RecipientOption[]}
      />
    </>
  );
}
