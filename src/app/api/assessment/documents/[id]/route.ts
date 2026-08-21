import { NextResponse } from "next/server";
import { requireSocialWorker } from "@/lib/require-social-worker";

const BUCKET = "care-documents";

// 원본 서류 내려받기.
// 수급자 개인정보가 담긴 비공개 저장소라, 파일을 그대로 열어주지 않고
// 짧게 유효한 링크를 만들어 넘깁니다.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireSocialWorker();
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  const { admin } = result;
  const { id } = await params;

  const { data: doc, error } = await admin
    .from("care_documents")
    .select("filename, storage_path")
    .eq("id", id)
    .single();

  if (error || !doc) {
    return NextResponse.json({ error: "서류를 찾을 수 없습니다." }, { status: 404 });
  }

  const { data, error: signErr } = await admin.storage
    .from(BUCKET)
    .createSignedUrl(doc.storage_path, 120, { download: doc.filename });

  if (signErr || !data) {
    return NextResponse.json({ error: "서류를 열 수 없습니다." }, { status: 404 });
  }

  return NextResponse.redirect(data.signedUrl);
}
