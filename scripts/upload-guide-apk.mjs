// 「평가 길잡이」 APK 를 osamcare.com 다운로드(osamcare.com/app)용 저장소에 올린다.
// 사용: node scripts/upload-guide-apk.mjs <APK 경로> <버전>
//   예) node scripts/upload-guide-apk.mjs "C:/Users/tasman/Desktop/요양보호사_평가안내앱/평가길잡이-0.7.1-시험용.apk" 0.7.1
// 올린 뒤 src/guide-content/app-release.json 이 바뀌므로 커밋·배포해야 페이지의 버전 표시가 바뀐다
// (파일 자체는 올리는 즉시 /app/download 에서 새것으로 받아진다).
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const [apkPath, version] = process.argv.slice(2);
if (!apkPath || !version) {
  console.error('사용: node scripts/upload-guide-apk.mjs <APK 경로> <버전>');
  process.exit(1);
}

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim().replace(/^"|"$/g, "")])
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });

const BUCKET = "app-downloads";
const { data: bucket } = await sb.storage.getBucket(BUCKET);
if (!bucket) {
  // 비공개: 파일은 /app/download 가 5분짜리 주소를 만들어 줄 때만 받을 수 있다
  const { error } = await sb.storage.createBucket(BUCKET, { public: false, fileSizeLimit: 50 * 1024 * 1024 });
  if (error) throw error;
  console.log("저장소(app-downloads)를 만들었습니다.");
}

const bytes = readFileSync(apkPath);
const opts = { contentType: "application/vnd.android.package-archive", upsert: true };
for (const path of ["guide/osam-guide.apk", `guide/archive/osam-guide-${version}.apk`]) {
  const { error } = await sb.storage.from(BUCKET).upload(path, bytes, opts);
  if (error) throw error;
}

const sizeMB = Math.round((statSync(apkPath).size / 1024 / 1024) * 10) / 10;
const updatedAt = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
writeFileSync(
  "src/guide-content/app-release.json",
  JSON.stringify({ version, file: "guide/osam-guide.apk", sizeMB, updatedAt }, null, 2) + "\n"
);
console.log(`올림: ${version} (${sizeMB}MB) → osamcare.com/app/download`);
