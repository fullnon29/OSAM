/**
 * 보관 서류에서 수급자 명단을 만듭니다.
 *
 *   node scripts/build-roster.mjs "<폴더>" [--write]
 *
 * --write 없이 돌리면 명단만 만들어 파일로 저장하고 등록은 하지 않습니다.
 *
 * 한 사람의 서류가 여러 건이라는 점을 이용합니다. 문서 한 건의 추출값은 틀릴 수
 * 있지만, 같은 인정번호를 가진 서류 전체에서 가장 많이 나온 값을 고르면
 * 한두 건의 오독에 흔들리지 않습니다(예: 김삼근 32건 vs 오독 '장기요양' 7건).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { extractDocumentText } from "../src/lib/documents/extract-text.ts";
import { identifyDocument } from "../src/lib/documents/identify.ts";

const args = process.argv.slice(2);
const rootDir = args.find((a) => !a.startsWith("--"));
const write = args.includes("--write");
if (!rootDir) { console.error('사용법: node scripts/build-roster.mjs "<폴더>" [--write]'); process.exit(1); }

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1)]; })
);

function mostCommon(counter) {
  let best = null, bestCount = 0;
  for (const [value, count] of counter) if (count > bestCount) { best = value; bestCount = count; }
  return { value: best, count: bestCount };
}
function bump(map, key, value) {
  if (!value) return;
  if (!map.has(key)) map.set(key, new Map());
  const m = map.get(key);
  m.set(value, (m.get(value) || 0) + 1);
}

const files = execSync(`find "${rootDir}" -type f \( -iname "*.hwp" -o -iname "*.pdf" \)`,
  { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 }).split("\n").filter(Boolean);
console.log(`서류 ${files.length}건에서 명단을 만듭니다...`);

const names = new Map(), grades = new Map(), docCount = new Map();
let noNumber = 0;

for (const [i, p] of files.entries()) {
  try {
    const { text } = await extractDocumentText(p, readFileSync(p));
    const id = identifyDocument(text, p);
    if (!id.ltcNumber) { noNumber++; continue; }
    bump(names, id.ltcNumber, id.name);
    bump(grades, id.ltcNumber, id.ltcGrade);
    docCount.set(id.ltcNumber, (docCount.get(id.ltcNumber) || 0) + 1);
  } catch { /* 읽기 실패는 명단에서 제외 */ }
  if ((i + 1) % 300 === 0) console.log(`  ...${i + 1}/${files.length}`);
}

// 한 사람 이름이 서로 다른 수급자 여럿에 걸쳐 나오면 수급자가 아니라 직원입니다.
// (예: 입소이용신청서의 "신청인 성명"은 담당 사회복지사 이름입니다.)
// 이런 이름은 명단에서 빼고, 그 사람의 다른 근거로 이름을 정하게 합니다.
const nameToNumbers = new Map();
for (const [ltcNumber, counter] of names) {
  for (const name of counter.keys()) {
    if (!nameToNumbers.has(name)) nameToNumbers.set(name, new Set());
    nameToNumbers.get(name).add(ltcNumber);
  }
}
const STAFF_NAME_THRESHOLD = 5;
const staffNames = new Set(
  [...nameToNumbers.entries()].filter(([, nums]) => nums.size >= STAFF_NAME_THRESHOLD).map(([n]) => n)
);
if (staffNames.size) {
  console.log(`
수급자가 아닌 것으로 보이는 이름 제외(서로 다른 수급자 ${STAFF_NAME_THRESHOLD}명 이상에 등장): ${[...staffNames].join(", ")}`);
  for (const counter of names.values()) for (const n of staffNames) counter.delete(n);
}

const roster = [];
for (const [ltcNumber, count] of docCount) {
  const name = mostCommon(names.get(ltcNumber) ?? new Map());
  const grade = mostCommon(grades.get(ltcNumber) ?? new Map());
  roster.push({
    ltcNumber,
    name: name.value,
    nameConfidence: name.count && count ? name.count / count : 0,
    ltcGrade: grade.value,
    documents: count,
  });
}
roster.sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "", "ko"));

const named = roster.filter((r) => r.name);
const unnamed = roster.filter((r) => !r.name);
console.log(`\n인정번호 ${roster.length}개 · 이름 확인 ${named.length}명 · 이름 미상 ${unnamed.length}명 · 인정번호 없는 서류 ${noNumber}건`);

const out = new URL("../수급자명단.csv", import.meta.url);
writeFileSync(out, "\uFEFF" + ["성명,장기요양인정번호,장기요양등급,서류수,이름근거비율",
  ...roster.map((r) => [r.name ?? "(미상)", r.ltcNumber, r.ltcGrade ?? "", r.documents,
    (r.nameConfidence * 100).toFixed(0) + "%"].join(","))].join("\n"), "utf8");
console.log(`명단 저장: 수급자명단.csv`);

console.log("\n--- 명단 미리보기 (앞 15명) ---");
named.slice(0, 15).forEach((r) => console.log(
  `  ${(r.name ?? "").padEnd(5)} ${r.ltcNumber}  ${(r.ltcGrade ?? "-").padEnd(6)} 서류 ${String(r.documents).padStart(3)}건  근거 ${(r.nameConfidence*100).toFixed(0)}%`));

const weak = named.filter((r) => r.nameConfidence < 0.5);
if (weak.length) {
  console.log(`\n근거가 약한 건(50% 미만) ${weak.length}명 - 확인 필요:`);
  weak.slice(0, 10).forEach((r) => console.log(`  ${r.name} ${r.ltcNumber} (${(r.nameConfidence*100).toFixed(0)}%)`));
}

if (!write) { console.log("\n(등록하지 않았습니다. 실제 등록하려면 --write)"); process.exit(0); }

const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } });

const { data: existing, error: exErr } = await db.from("care_recipients").select("id, name, ltc_number");
if (exErr) throw exErr;
const haveNumber = new Set(existing.map((r) => r.ltc_number).filter(Boolean));
const haveName = new Map(existing.filter((r) => !r.ltc_number).map((r) => [r.name, r.id]));

let inserted = 0, updated = 0, skipped = 0;
for (const r of named) {
  if (haveNumber.has(r.ltcNumber)) { skipped++; continue; }
  // 인정번호 없이 이름만으로 먼저 만들어 둔 수급자가 있으면 번호를 채워 줍니다.
  const sameName = haveName.get(r.name);
  if (sameName) {
    const { error } = await db.from("care_recipients")
      .update({ ltc_number: r.ltcNumber, ltc_grade: r.ltcGrade }).eq("id", sameName);
    if (error) throw error;
    updated++; continue;
  }
  const { error } = await db.from("care_recipients")
    .insert({ name: r.name, ltc_number: r.ltcNumber, ltc_grade: r.ltcGrade });
  if (error) throw error;
  inserted++;
}
console.log(`\n등록 ${inserted}명 · 기존 정보 보완 ${updated}명 · 이미 있음 ${skipped}명`);
