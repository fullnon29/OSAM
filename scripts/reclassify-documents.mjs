/**
 * 저장된 서류의 종류를 다시 판정합니다.
 *
 *   node scripts/reclassify-documents.mjs [--write]
 *
 * 분류 규칙이 바뀌었을 때 씁니다. 본문은 이미 저장돼 있어 원본 파일을 다시
 * 읽지 않습니다.
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { classifyDocument } from "../src/lib/documents/classify.ts";

const write = process.argv.includes("--write");
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8")
  .split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"))
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1)]; }));
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } });

const rows = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await db.from("care_documents")
    .select("id, filename, raw_text, doc_types").range(from, from + 999);
  if (error) throw error;
  rows.push(...data);
  if (data.length < 1000) break;
}
console.log(`대상 ${rows.length}건${write ? "" : "  (모의 실행)"}\n`);

let changed = 0;
const before = {}, after = {};
for (const row of rows) {
  const old = (row.doc_types ?? []).join("+") || "기타";
  const next = classifyDocument(row.raw_text ?? "");
  const key = next.join("+") || "기타";
  before[old] = (before[old] ?? 0) + 1;
  after[key] = (after[key] ?? 0) + 1;
  if (key === old) continue;
  changed++;
  if (write) {
    const { error } = await db.from("care_documents").update({ doc_types: next }).eq("id", row.id);
    if (error) throw error;
  }
}

const show = (title, obj) => {
  console.log(title);
  Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, 8)
    .forEach(([k, v]) => console.log(`  ${String(v).padStart(4)}  ${k}`));
};
show("이전 분류:", before);
console.log();
show("새 분류:", after);
console.log(`\n바뀐 문서: ${changed}건`);
const assessBefore = rows.filter((r) => (r.doc_types ?? []).includes("욕구사정")).length;
const assessAfter = rows.filter((r) => classifyDocument(r.raw_text ?? "").includes("욕구사정")).length;
console.log(`욕구사정 판정: ${assessBefore}건 -> ${assessAfter}건`);
if (!write) console.log("\n(저장하지 않았습니다. 반영하려면 --write)");
