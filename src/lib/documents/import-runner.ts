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
import { extractWorklog } from "./extract-worklog";
import { extractNarratives } from "./extract-narratives";

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

/**
 * 서술 문장을 저장합니다. 같은 서류의 같은 문장은 표의 고유 규칙(document_id, md5(body))이 막아 주므로,
 * 중복 오류(23505)는 이미 있다는 뜻이라 건너뜁니다. 저장에 성공한 수를 돌려줍니다.
 * (식이 들어간 upsert 의 onConflict 는 서버가 받아 주지 않아 쓰지 않습니다.)
 */
export async function saveNarrativeRows(
  db: SupabaseClient,
  rows: Record<string, unknown>[]
): Promise<number> {
  let saved = 0;
  for (let i = 0; i < rows.length; i += 100) {
    const batch = rows.slice(i, i + 100);
    const { error } = await db.from("narrative_samples").insert(batch);
    if (!error) {
      saved += batch.length;
      continue;
    }
    // 한 줄이라도 겹치면 묶음 전체가 거절됩니다. 한 건씩 넣어 나머지를 살립니다.
    for (const row of batch) {
      const { error: one } = await db.from("narrative_samples").insert(row);
      if (!one) saved++;
    }
  }
  return saved;
}

export type ImportDetail = {
  filename: string;
  status: "uploaded" | "skipped" | "rejected" | "failed";
  name: string | null;
  matched: boolean;
  /** 서류에 적힌 작성일(욕구사정·일지) */
  date: string | null;
  note?: string;
};

export type ImportResult = {
  total: number;
  uploaded: number;
  skipped: number;
  matched: number;
  failed: number;
  /** only 로 종류를 정했을 때 그 종류가 아니라서 올리지 않은 파일 수 */
  rejected: number;
  /** 서류에서 뽑아 저장한 서술 수(욕구사정) */
  narratives: number;
  cancelled: boolean;
  problems: string[];
  details: ImportDetail[];
};

/**
 * 욕구사정 서류의 작성일. 본문의 「작성일 … 2024. 10. 02」를 먼저 보고, 없으면 파일 이름의 날짜(24.03.22 · 2024.10.02 · 20241002)를 봅니다.
 * 못 찾으면 null — 틀린 날짜보다 빈 칸이 낫습니다.
 */
export function guessAssessmentDate(filename: string, text: string): string | null {
  const ok = (y: number, m: number, d: number) =>
    y >= 2010 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31
      ? `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`
      : null;
  const body = text.match(/작성\s*일[^0-9]{0,60}(\d{4})\s*[.\-년/]\s*(\d{1,2})\s*[.\-월/]\s*(\d{1,2})/);
  if (body) {
    const r = ok(+body[1], +body[2], +body[3]);
    if (r) return r;
  }
  const full = filename.match(/(20\d{2})[.\-_ ]?(\d{2})[.\-_ ]?(\d{2})/);
  if (full) {
    const r = ok(+full[1], +full[2], +full[3]);
    if (r) return r;
  }
  const short = filename.match(/(?:^|[^0-9])(\d{2})\.(\d{2})\.(\d{2})(?:[^0-9]|$)/);
  if (short) return ok(2000 + +short[1], +short[2], +short[3]);
  return null;
}

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
  /** 폴더를 훑어 hwp/pdf 를 모두 올립니다. files 를 주면 이 값은 무시합니다. */
  dir?: string;
  /** 고른 파일만 올립니다. */
  files?: string[];
  /** 이 종류(예: "욕구사정")로 분류되는 서류만 올리고 나머지는 올리지 않습니다. */
  only?: string;
  db: SupabaseClient;
  onProgress?: (p: ImportProgress) => void;
  shouldCancel?: () => boolean;
}): Promise<ImportResult> {
  const { db, onProgress, shouldCancel, only } = params;

  const files = params.files?.length ? [...params.files] : await findDocuments(params.dir ?? "");
  const seen = await loadExistingHashes(db);
  const byLtcNumber = await loadRecipientsByLtcNumber(db);

  let uploaded = 0, skipped = 0, matched = 0, failed = 0, rejected = 0, narrativeCount = 0;
  const details: ImportDetail[] = [];
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
        details.push({ filename, status: "skipped", name: null, matched: false, date: null, note: "이미 올라가 있는 같은 파일입니다." });
      } else {
        const extracted = await extractDocumentText(filePath, bytes);
        const docTypes = classifyDocument(extracted.text);
        const id = identifyDocument(extracted.text, filePath);
        if (only && !(docTypes as string[]).includes(only)) {
          rejected++;
          details.push({ filename, status: "rejected", name: id.name, matched: false, date: null, note: `${only} 서식으로 읽히지 않아 올리지 않았습니다(읽힌 종류: ${docTypes.join("·") || "없음"}).` });
          onProgress?.({ done: i + 1, total: files.length, filename, uploaded, skipped, matched, failed });
          continue;
        }
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

        const worklog = docTypes.includes("업무수행일지")
          ? extractWorklog(extracted.text) : null;

        const { data: insData, error: insErr } = await db.from("care_documents").insert({
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
          document_date: worklog?.visitDate ?? (docTypes.includes("욕구사정") ? guessAssessmentDate(filename, extracted.text) : null),
        }).select("id").single();
        if (insErr) throw insErr;

        if (worklog && match && insData) {
          const SECTION_MAP: Record<string, string> = {
            s9_opinion: "상담기록",
            summary: "향후계획",
          };
          const rows = worklog.items
            .filter((it) => it.code === "s9_opinion" || it.code === "summary")
            .map((it) => ({
              care_recipient_id: match.id,
              document_id: insData.id,
              section: SECTION_MAP[it.code] ?? it.label,
              heading: it.label,
              body: it.text,
              document_date: worklog.visitDate,
            }));
          if (rows.length) {
            await db.from("narrative_samples").insert(rows);
          }
        }

        // 욕구사정 서류는 서술 문장(신체상태·총평 등)도 함께 저장합니다. 그래야 총평 초안이 최신 글투와 지난 서술을 참고합니다.
        let docNarratives = 0;
        const assessDate = docTypes.includes("욕구사정") ? guessAssessmentDate(filename, extracted.text) : null;
        if (docTypes.includes("욕구사정") && insData) {
          const found = extractNarratives(extracted.text);
          const rows = found.map((n) => ({
            care_recipient_id: match ? match.id : null,
            document_id: insData.id,
            section: n.section,
            heading: n.heading,
            body: n.text,
            document_date: assessDate,
          }));
          docNarratives = await saveNarrativeRows(db, rows);
          narrativeCount += docNarratives;
        }

        seen.add(hash);
        uploaded++;
        if (match) matched++;
        details.push({
          filename, status: "uploaded", name: id.name, matched: !!match, date: worklog?.visitDate ?? assessDate,
          note: (match ? `${match.name} 님에게 연결` : "수급자 표에 같은 인정번호가 없어 미연결") + (docNarratives ? ` · 서술 ${docNarratives}개 저장` : ""),
        });
      }
    } catch (e) {
      failed++;
      const msg = e instanceof Error ? e.message : String(e);
      problems.push(`${filename}: ${msg.slice(0, 120)}`);
      details.push({ filename, status: "failed", name: null, matched: false, date: null, note: msg.slice(0, 120) });
    }

    onProgress?.({ done: i + 1, total: files.length, filename, uploaded, skipped, matched, failed });
  }

  return { total: files.length, uploaded, skipped, matched, failed, rejected, narratives: narrativeCount, cancelled, problems: problems.slice(0, 50), details };
}
