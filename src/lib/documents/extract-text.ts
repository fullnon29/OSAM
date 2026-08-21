// 웹(서버)과 로컬 프로그램이 함께 쓰는 공용 모듈입니다(요구사항 11: 로컬+웹).
// next 의 server-only 가드를 두면 로컬 스크립트에서 불러올 수 없어 사용하지 않습니다.
// node 내장 모듈에 의존하므로 클라이언트 번들에는 어차피 포함될 수 없습니다.
import zlib from "node:zlib";
import CFB from "cfb";
import { controlCharUnitLen, parseRecords, HWPTAG_PARA_TEXT } from "../hwp/record-stream";

// 보관 중인 욕구사정 서류에서 본문을 읽어냅니다.
// 기본 서식은 hwp이고 간혹 pdf가 섞여 있습니다(요구사항 7).

export type ExtractedDocument = {
  kind: "hwp" | "pdf";
  text: string;
  /** hwp의 BodyText 구역 수 / pdf의 쪽수 */
  parts: number;
};

export class UnsupportedDocumentError extends Error {
  constructor(filename: string) {
    super(`지원하지 않는 파일 형식입니다: ${filename} (hwp 또는 pdf만 읽을 수 있습니다)`);
    this.name = "UnsupportedDocumentError";
  }
}

// PARA_TEXT는 UTF-16LE이지만 제어문자가 섞여 있고, 서식에 따라
// 원문자(①②③)가 서로게이트 쌍(PUA)으로 들어 있습니다.
// 사람이 읽을 수 있게 옮기되 자리는 유지되도록 치환합니다.
const PUA_PLACEHOLDER = "○";

function decodeParaTextForReading(data: Buffer): string {
  let out = "";
  let i = 0;
  while (i < data.length) {
    const code = data.readUInt16LE(i);
    if (code >= 0xd800 && code <= 0xdbff && i + 2 < data.length) {
      const low = data.readUInt16LE(i + 2);
      if (low >= 0xdc00 && low <= 0xdfff) {
        out += PUA_PLACEHOLDER;
        i += 4;
        continue;
      }
    }
    const units = controlCharUnitLen(code);
    if (code >= 32) out += String.fromCharCode(code);
    else if (code === 0x0a || code === 0x0d) out += "\n";
    i += units * 2;
  }
  return out;
}

export function extractHwpText(bytes: Buffer): ExtractedDocument {
  const cfb = CFB.read(bytes, { type: "buffer" });
  // 서식에 따라 BodyText 구역이 여러 개입니다(예: 욕구사정 + 낙상/욕창평가).
  // 하나만 읽으면 뒷장이 통째로 누락되므로 전부 순서대로 읽습니다.
  const sectionIdx = cfb.FullPaths
    .map((p, i) => ({ p, i }))
    .filter((x) => /BodyText\/Section\d+$/.test(x.p))
    .sort((a, b) => {
      const n = (s: string) => Number(s.match(/Section(\d+)$/)?.[1] ?? 0);
      return n(a.p) - n(b.p);
    });

  if (sectionIdx.length === 0) {
    throw new Error("hwp 본문(BodyText)을 찾을 수 없습니다. 손상되었거나 hwp 형식이 아닐 수 있습니다.");
  }

  const parts: string[] = [];
  for (const { i } of sectionIdx) {
    const entry = cfb.FileIndex[i];
    const content = Buffer.from(entry.content as Buffer);
    // 배포용 hwp는 본문이 raw deflate로 압축되어 있지만, 압축을 끄고 저장한
    // 파일도 있어 실패하면 원본 그대로 해석합니다.
    let raw: Buffer;
    try {
      raw = Buffer.from(zlib.inflateRawSync(content));
    } catch {
      raw = content;
    }
    const lines: string[] = [];
    for (const rec of parseRecords(raw)) {
      if (rec.tagId !== HWPTAG_PARA_TEXT) continue;
      const t = decodeParaTextForReading(rec.data).trim();
      if (t) lines.push(t);
    }
    parts.push(lines.join("\n"));
  }

  return { kind: "hwp", text: parts.join("\n\n"), parts: parts.length };
}

export async function extractPdfText(bytes: Buffer): Promise<ExtractedDocument> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { totalPages, text } = await extractText(pdf, { mergePages: false });
  const pages = Array.isArray(text) ? text : [text];
  return { kind: "pdf", text: pages.join("\n\n"), parts: totalPages };
}

export async function extractDocumentText(
  filename: string,
  bytes: Buffer
): Promise<ExtractedDocument> {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".hwp")) return extractHwpText(bytes);
  if (lower.endsWith(".pdf")) return extractPdfText(bytes);
  throw new UnsupportedDocumentError(filename);
}
