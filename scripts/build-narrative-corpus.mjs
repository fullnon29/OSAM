/**
 * 과거 욕구사정 서류에서 서술형 문장을 골라 모읍니다.
 *
 *   node scripts/build-narrative-corpus.mjs [--rebuild] [--limit N]
 *
 * AI를 쓰지 않고 규칙으로만 잘라내므로 비용이 들지 않고 결과가 늘 같습니다.
 * 여러 번 돌려도 같은 문장이 늘어나지 않으니 새 서류가 들어올 때마다
 * 다시 돌리면 됩니다. --rebuild 를 주면 기존 모음을 비우고 처음부터 만듭니다.
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { extractNarratives } from "../src/lib/documents/extract-narratives.ts";

const args = process.argv.slice(2);
const rebuild = args.includes("--rebuild");
const limitArg = args.indexOf("--limit");
const limit = limitArg >= 0 ? Number(args[limitArg + 1]) : Infinity;

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1)];
    })
);

const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

if (rebuild) {
  const { error } = await db.from("narrative_samples").delete().not("id", "is", null);
  if (error) throw error;
  console.log("기존 모음을 비웠습니다.");
}

// 서류가 1,700건이 넘어 한 번에 다 오지 않습니다. 나눠 받습니다.
const documents = [];
for (let from = 0; ; from += 500) {
  const { data, error } = await db
    .from("care_documents")
    .select("id, filename, raw_text, care_recipient_id, document_date")
    .contains("doc_types", ["욕구사정"])
    .not("raw_text", "is", null)
    .order("created_at")
    .range(from, from + 499);
  if (error) throw error;
  if (!data.length) break;
  documents.push(...data);
  if (data.length < 500) break;
}

console.log(`욕구사정 서류 ${documents.length}건에서 서술을 찾습니다.`);

const rows = [];
const bySection = {};
let withNarrative = 0;

for (const doc of documents.slice(0, limit)) {
  const found = extractNarratives(doc.raw_text);
  if (found.length) withNarrative++;
  for (const n of found) {
    bySection[n.section] = (bySection[n.section] ?? 0) + 1;
    rows.push({
      care_recipient_id: doc.care_recipient_id,
      document_id: doc.id,
      section: n.section,
      heading: n.heading,
      body: n.text,
      document_date: doc.document_date,
    });
  }
}

console.log(`서술이 있는 서류 ${withNarrative}건 · 문장 덩어리 ${rows.length}개`);

// 같은 서류에서 같은 문장을 두 번 담지 않도록 표에 걸어 둔 규칙에 맞춰 넣습니다.
let saved = 0;
for (let i = 0; i < rows.length; i += 200) {
  const batch = rows.slice(i, i + 200);
  const { error } = await db
    .from("narrative_samples")
    .upsert(batch, { onConflict: "document_id, md5(body)", ignoreDuplicates: true });
  if (error) {
    // 같은 문장이 겹쳐 걸리면 한 건씩 넣어 나머지를 살립니다.
    for (const row of batch) {
      const { error: one } = await db.from("narrative_samples").insert(row);
      if (!one) saved++;
    }
    continue;
  }
  saved += batch.length;
  process.stdout.write(`\r저장 ${Math.min(i + 200, rows.length)}/${rows.length}`);
}

console.log(`\n저장 완료: ${saved}개`);
console.log("\n갈래별 개수");
for (const [k, v] of Object.entries(bySection).sort((a, b) => b[1] - a[1])) {
  console.log(String(v).padStart(6), k);
}
