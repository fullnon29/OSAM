/**
 * 보관 서류에서 낙상·욕창 위험도 평가 결과를 읽어 저장합니다 (요구사항 10).
 *
 *   node scripts/extract-risk-scores.mjs [--write]
 *
 * 점수표라 자리가 정해져 있어 AI를 쓰지 않습니다. 본문은 이미 저장돼 있어
 * 원본 파일을 다시 읽지도 않습니다.
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { extractRiskAssessments } from "../src/lib/documents/extract-risk.ts";

const write = process.argv.includes("--write");
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8")
  .split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"))
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1)]; }));
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } });

const rows = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await db.from("care_documents")
    .select("id, filename, raw_text").range(from, from + 999);
  if (error) throw error;
  rows.push(...data);
  if (data.length < 1000) break;
}
console.log(`전체 ${rows.length}건 검사${write ? "" : "  (모의 실행)"}\n`);

let fall = 0, ulcer = 0, saved = 0;
for (const row of rows) {
  const risk = extractRiskAssessments(row.raw_text ?? "");
  if (!risk.fall && !risk.pressureUlcer) continue;
  if (risk.fall) fall++;
  if (risk.pressureUlcer) ulcer++;
  if (write) {
    const { error } = await db.from("care_documents")
      .update({ risk_assessments: risk }).eq("id", row.id);
    if (error) throw error;
  }
  saved++;
}
console.log(`위험도 평가가 담긴 서류: ${saved}건`);
console.log(`  낙상 점수: ${fall}건`);
console.log(`  욕창 점수: ${ulcer}건`);
if (!write) console.log("\n(저장하지 않았습니다. 반영하려면 --write)");
