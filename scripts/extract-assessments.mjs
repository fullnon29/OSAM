/**
 * 과거 욕구사정 서류를 읽어 문항별 응답으로 옮깁니다 (요구사항 2).
 *
 *   node scripts/extract-assessments.mjs [--limit N] [--retry-failed] [--concurrency N]
 *
 * 이미 처리한 서류는 건너뛰므로 중단 후 다시 돌려도 안전합니다.
 * 결과는 원본 서류에 붙여 두기만 하고 정식 기록으로 만들지는 않습니다.
 * 사람이 새 회차를 쓸 때 불러와 확인·수정한 뒤 저장합니다.
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { extractAssessmentFromText, buildFormSpec } from "../src/lib/documents/extract-assessment.ts";

const args = process.argv.slice(2);
const limitArg = args.indexOf("--limit");
const limit = limitArg >= 0 ? Number(args[limitArg + 1]) : Infinity;
const retryFailed = args.includes("--retry-failed");
// 한 건에 40초 남짓 걸려 순차로 돌리면 수백 건에 몇 시간이 듭니다.
// 서로 독립된 작업이라 몇 건씩 동시에 처리하되, 호출 한도에 걸리지 않도록
// 적당한 수로 제한합니다.
const concArg = args.indexOf("--concurrency");
const concurrency = concArg >= 0 ? Math.max(1, Number(args[concArg + 1])) : 4;

const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8")
  .split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"))
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1)]; }));

if (!env.ANTHROPIC_API_KEY) { console.error("ANTHROPIC_API_KEY 가 없습니다."); process.exit(1); }

const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } });

const statuses = retryFailed ? ["pending", "failed"] : ["pending"];
const { data: targets, error } = await db
  .from("care_documents")
  .select("id, filename, raw_text, extracted_name")
  .contains("doc_types", ["욕구사정"])
  .in("extraction_status", statuses)
  .order("created_at");
if (error) throw error;

const queue = targets.slice(0, limit);
console.log(`추출 대상 ${queue.length}건 (전체 미처리 ${targets.length}건)\n`);

const formSpec = buildFormSpec();
let done = 0, failed = 0, skipped = 0, started = 0;
const fillRates = [];
const startedAt = Date.now();

async function processOne(doc) {
  const index = ++started;
  const label = `${doc.extracted_name ?? "이름미상"} · ${doc.filename.slice(0, 34)}`;

  // 본문이 너무 짧으면 서식이 아니거나 읽히지 않은 것이라 호출하지 않습니다.
  if (!doc.raw_text || doc.raw_text.length < 500) {
    await db.from("care_documents")
      .update({ extraction_status: "skipped", extraction_error: "본문이 너무 짧음" })
      .eq("id", doc.id);
    skipped++;
    return;
  }

  try {
    const r = await extractAssessmentFromText({
      text: doc.raw_text, apiKey: env.ANTHROPIC_API_KEY, formSpec,
    });
    const { error: upErr } = await db.from("care_documents").update({
      extracted_responses: r.responses,
      document_date: r.documentDate,
      extraction_status: "done",
      extraction_error: null,
      extracted_at: new Date().toISOString(),
    }).eq("id", doc.id);
    if (upErr) throw upErr;

    fillRates.push(r.filled);
    done++;
    console.log(`  [${index}/${queue.length}] ${label} → ${r.filled}/${r.total} 문항`);
  } catch (e) {
    failed++;
    const msg = String(e.message ?? e).slice(0, 200);
    await db.from("care_documents")
      .update({ extraction_status: "failed", extraction_error: msg })
      .eq("id", doc.id);
    console.error(`  [${index}/${queue.length}] ${label} → 실패: ${msg.slice(0, 80)}`);
  }
}

// 같은 대기열을 여러 일꾼이 나눠 가져갑니다.
const pending = [...queue];
await Promise.all(
  Array.from({ length: Math.min(concurrency, pending.length) }, async () => {
    for (let doc = pending.shift(); doc; doc = pending.shift()) await processOne(doc);
  })
);

const mins = ((Date.now() - startedAt) / 60000).toFixed(1);
const avg = fillRates.length ? Math.round(fillRates.reduce((s, n) => s + n, 0) / fillRates.length) : 0;
console.log(`\n완료 ${done} · 실패 ${failed} · 건너뜀 ${skipped} · ${mins}분`);
console.log(`평균 채워진 문항: ${avg}/147`);
