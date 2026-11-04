import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import release from "@/guide-content/app-release.json";

// 「평가 길잡이」 APK 내려받기: 비공개 저장소(app-downloads)의 파일로 5분짜리 주소를 만들어 넘긴다.
// APK 를 새로 만들면 OSAM/scripts/upload-guide-apk.mjs 로 올리고 app-release.json 을 바꿔 배포한다.
export async function GET() {
  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from("app-downloads")
    .createSignedUrl(release.file, 300, { download: `pyeongga-giljabi-${release.version}.apk` });
  if (error || !data) {
    console.error(error);
    return NextResponse.json({ error: "앱 파일을 찾을 수 없습니다. 사무실에 문의해 주세요." }, { status: 404 });
  }
  return NextResponse.redirect(data.signedUrl);
}
