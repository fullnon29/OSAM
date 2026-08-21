// 폴더에 있는 수급자 서류를 읽어 시스템에 올리는 과정.
//
// 윈도우 프로그램과 명령어 스크립트가 같은 코드를 씁니다. 화면에 어떻게
// 보여줄지는 부르는 쪽이 정하고, 여기서는 진행 상황만 알려 줍니다.
//
// 웹과 로컬 프로그램이 함께 쓰는 공용 모듈이라 server-only 가드를 두지 않습니다.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { extractDocumentText } from "./extract-text";
import { identifyDocument } from "./identify";
import { classifyDocument } from "./classify";
import { extractRiskAssessments } from "./extract-risk";

export const DOCUMENT_BUCKET = "care-documents";

export type ImportProgress = {
  done: number;
  total: number;
  filename: string;
  uploaded: number;
  skipped: number;
  matched: number;
  failed: number;
};

export type ImportResult = {
  total: number;
  uploaded: number;
  skipped: number;
  matched: number;
  failed: number;
  cancelled: boolean;
  problems: string[];
};

/** 폴더를 재귀로 훑어 hwp/pdf 만 모읍니다. 읽을 수 없는 폴더는 건너뜁니다. */
export async function findDocuments(dir: string): Promise<string[]> {
  const found: string[] = [];
  async function walk(current: string) {
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (/\.(hwp|pdf)$/i.test(entry.name)) found.push(full);
    }
  }
  await walk(dir);
  found.sort();
  return found;
}

async function loadExistingHashes(db: SupabaseClient): Promise<Set<string>> {
  const seen = new Set<string>();
  // 한 번에 1,000행까지만 돌아오므로 끝까지 나눠 받습니다.
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from("care_documents").select("file_hash").range(from, from + 999);
    if (error) throw error;
    for (const row of data) seen.add(row.file_hash as string);
    if (data.length < 1000) break;
  }
  return seen;
}

async function loadRecipientsByLtcNumber(db: SupabaseClient) {
  const { data, error } = await db.from("care_recipients").select("id, name, ltc_number");
  if (error) throw error;
  const map = new Map<string, { id: string; name: string }>();
  for (const r of data) {
    if (r.ltc_number) map.set(r.ltc_number as string, { id: r.id as string, name: r.name as string });
  }
  return map;
}

export async function importDocuments(params: {
  dir: string;
  db: SupabaseClient;
  onProgress?: (p: ImportProgress) => void;
  shouldCancel?: () => boolean;
}): Promise<ImportResult> {
  const { dir, db, onProgress, shouldCancel } = params;

  const files = await findDocuments(dir);
  const seen = await loadExistingHashes(db);
  const byLtcNumber = await loadRecipientsByLtcNumber(db);

  let uploaded = 0, skipped = 0, matched = 0, failed = 0;
  const problems: string[] = [];
  let cancelled = false;

  for (const [i, filePath] of files.entries()) {
    if (shouldCancel?.()) { cancelled = true; break; }
    const filename = path.basename(filePath);

    try {
      const bytes = readFileSync(filePath);
      const hash = createHash("sha256").update(bytes).digest("hex");

      if (seen.has(hash)) {
        skipped++;
      } else {
        const extracted = await extractDocumentText(filePath, bytes);
        const docTypes = classifyDocument(extracted.text);
        const id = identifyDocument(extracted.text, filePath);
        const risk = extractRiskAssessments(extracted.text);

        // 인정번호가 같을 때만 자동으로 연결합니다. 이름은 동명이인이 있어
        // 잘못 붙으면 엉뚱한 어르신 기록이 되므로 사람이 확인하도록 둡니다.
        const match = id.ltcNumber ? byLtcNumber.get(id.ltcNumber) : undefined;

        const ext = filename.toLowerCase().endsWith(".pdf") ? "pdf" : "hwp";
        const storagePath = `${hash.slice(0, 2)}/${hash}.${ext}`;

        const { error: upErr } = await db.storage.from(DOCUMENT_BUCKET).upload(storagePath, bytes, {
          contentType: ext === "pdf" ? "application/pdf" : "application/x-hwp",
          upsert: true,
        });
        if (upErr) throw upErr;

        const { error: insErr } = await db.from("care_documents").insert({
          filename,
          file_hash: hash,
          storage_path: storagePath,
          byte_size: bytes.length,
          ext,
          doc_types: docTypes,
          extracted_name: id.name,
          extracted_ltc_number: id.ltcNumber,
          extracted_ltc_grade: id.ltcGrade,
          raw_text: extracted.text,
          care_recipient_id: match ? match.id : null,
          match_status: match ? "auto" : "unmatched",
          risk_assessments: risk.fall || risk.pressureUlcer ? risk : null,
        });
        if (insErr) throw insErr;

        seen.add(hash);
        uploaded++;
        if (match) matched++;
      }
    } catch (e) {
      failed++;
      const msg = e instanceof Error ? e.message : String(e);
      problems.push(`${filename}: ${msg.slice(0, 120)}`);
    }

    onProgress?.({ done: i + 1, total: files.length, filename, uploaded, skipped, matched, failed });
  }

  return { total: files.length, uploaded, skipped, matched, failed, cancelled, problems: problems.slice(0, 50) };
}
