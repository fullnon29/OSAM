/**
 * 보관 중인 수급자 서류를 시스템에 올립니다 (요구사항 0·1·3·4·7).
 *
 *   node scripts/import-documents.mjs "<폴더경로>" [--dry-run] [--limit N]
 *
 * 하는 일
 *   1. 폴더에서 hwp/pdf 를 모두 찾습니다
 *   2. 본문을 읽고 문서 종류와 수급자 식별값(이름·등급·인정번호)을 뽑습니다
 *   3. 내용 해시로 이미 올린 파일은 건너뜁니다
 *   4. 원본을 Storage 에 올리고 목록에 기록합니다
 *   5. 인정번호가 일치하는 수급자가 있으면 연결하고, 아니면 미연결로 둡니다
 *
 * 여러 번 돌려도 안전합니다(같은 파일은 건너뜀).
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { extractDocumentText } from "../src/lib/documents/extract-text.ts";
import { identifyDocument } from "../src/lib/documents/identify.ts";
import { classifyDocument } from "../src/lib/documents/classify.ts";

const BUCKET = "care-documents";

const args = process.argv.slice(2);
const rootDir = args.find((a) => !a.startsWith("--"));
const dryRun = args.includes("--dry-run");
const limitArg = args.indexOf("--limit");
const limit = limitArg >= 0 ? Number(args[limitArg + 1]) : Infinity;

if (!rootDir) {
  console.error('사용법: node scripts/import-documents.mjs "<폴더경로>" [--dry-run] [--limit N]');
  process.exit(1);
}

function loadEnv() {
  const text = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  return Object.fromEntries(
    text.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"))
      .map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1)]; })
  );
}

const env = loadEnv();
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function findFiles(dir) {
  const out = execSync(`find "${dir}" -type f \( -iname "*.hwp" -o -iname "*.pdf" \)`, {
    encoding: "utf8", maxBuffer: 256 * 1024 * 1024,
  });
  return out.split("\n").filter(Boolean);
}

async function main() {
  const files = findFiles(rootDir).slice(0, limit);
  console.log(`대상 파일: ${files.length}건${dryRun ? "  (모의 실행 - 저장하지 않음)" : ""}\n`);

  // 이미 올라간 해시는 다시 올리지 않습니다.
  const seen = new Set();
  if (!dryRun) {
    for (let from = 0; ; from += 1000) {
      const { data, error } = await db.from("care_documents").select("file_hash").range(from, from + 999);
      if (error) throw error;
      data.forEach((r) => seen.add(r.file_hash));
      if (data.length < 1000) break;
    }
  }

  // 인정번호로 수급자를 찾기 위한 대조표
  const byLtcNumber = new Map();
  if (!dryRun) {
    const { data, error } = await db.from("care_recipients").select("id, name, ltc_number");
    if (error) throw error;
    data.forEach((r) => { if (r.ltc_number) byLtcNumber.set(r.ltc_number, r); });
  }

  const stat = { uploaded: 0, skipped: 0, matched: 0, failed: 0, byType: {}, names: new Set() };

  for (const [i, filePath] of files.entries()) {
    const filename = path.basename(filePath);
    try {
      const bytes = readFileSync(filePath);
      const hash = createHash("sha256").update(bytes).digest("hex");
      if (seen.has(hash)) { stat.skipped++; continue; }

      const extracted = await extractDocumentText(filePath, bytes);
      const docTypes = classifyDocument(extracted.text);
      const id = identifyDocument(extracted.text, filePath);

      const key = docTypes.length ? docTypes.join("+") : "기타";
      stat.byType[key] = (stat.byType[key] || 0) + 1;
      if (id.name) stat.names.add(id.name);

      if (dryRun) { stat.uploaded++; continue; }

      // 인정번호가 같을 때만 자동 연결합니다. 이름은 동명이인이 있을 수 있어
      // 근거로 삼지 않고, 사람이 검토 화면에서 확인하도록 남겨 둡니다.
      const match = id.ltcNumber ? byLtcNumber.get(id.ltcNumber) : null;

      const ext = filename.toLowerCase().endsWith(".pdf") ? "pdf" : "hwp";
      const storagePath = `${hash.slice(0, 2)}/${hash}.${ext}`;
      const { error: upErr } = await db.storage.from(BUCKET).upload(storagePath, bytes, {
        contentType: ext === "pdf" ? "application/pdf" : "application/x-hwp",
        upsert: true,
      });
      if (upErr) throw upErr;

      const { error: insErr } = await db.from("care_documents").insert({
        filename, file_hash: hash, storage_path: storagePath,
        byte_size: bytes.length, ext, doc_types: docTypes,
        extracted_name: id.name, extracted_ltc_number: id.ltcNumber,
        extracted_ltc_grade: id.ltcGrade, raw_text: extracted.text,
        care_recipient_id: match ? match.id : null,
        match_status: match ? "auto" : "unmatched",
      });
      if (insErr) throw insErr;

      seen.add(hash);
      stat.uploaded++;
      if (match) stat.matched++;
    } catch (e) {
      stat.failed++;
      console.error(`  실패 ${filename}: ${String(e.message).slice(0, 90)}`);
    }

    if ((i + 1) % 100 === 0) console.log(`  ...${i + 1}/${files.length}`);
  }

  console.log(`\n올림 ${stat.uploaded} · 건너뜀(중복) ${stat.skipped} · 수급자 연결 ${stat.matched} · 실패 ${stat.failed}`);
  console.log(`식별된 수급자: ${stat.names.size}명`);
  console.log("문서 종류:");
  for (const [k, v] of Object.entries(stat.byType).sort((a, b) => b[1] - a[1]))
    console.log(`  ${String(v).padStart(4)}  ${k}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
