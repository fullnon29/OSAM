import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import CFB from "cfb";
import { parseRecords, type HwpRecord } from "./hwp/record-stream";
import { CURRENT_FORM_VERSION, getSections } from "./assessment-form";
import fieldMap from "@/assets/forms/hwp-field-map.json";

type Responses = Record<string, string | string[] | number | undefined>;

type MarkerRef = { kind: "box" | "bracket" | "pua"; headerIndex: number; overwriteByteOffset: number };
type FieldMapEntry =
  | { kind: "options"; options: MarkerRef[] }
  | { kind: "scale4"; headerIndex: number; puaByteOffsets: number[] };

const fieldMapTyped = fieldMap as Record<string, FieldMapEntry>;

// hwp-field-map.json 은 2026년 서식 템플릿의 바이트 위치를 그대로 담고 있습니다.
// 다른 서식으로 작성된 기록에 이 좌표를 쓰면 엉뚱한 칸에 체크가 찍히므로,
// 이 생성기는 템플릿과 같은 버전에만 쓸 수 있습니다.
export const HWP_TEMPLATE_FORM_VERSION = CURRENT_FORM_VERSION;

const fieldsByCode = new Map(
  getSections(HWP_TEMPLATE_FORM_VERSION).flatMap((s) => s.fields).map((f) => [f.code, f])
);

const CHECK_CHAR_CODE = 0x25a0; // ■ - overwrites a "□"
const CHECKMARK_CODE = 0x221a; // √ - overwrites a bracket/PUA "space" slot

function loadTemplateBytes(): Buffer {
  return readFileSync(path.join(process.cwd(), "src/assets/forms/욕구사정_template.hwp"));
}

function findBodyTextEntry(cfb: CFB.CFB$Container) {
  const idx = cfb.FullPaths.findIndex((p) => p.includes("BodyText/Section0"));
  return cfb.FileIndex[idx];
}

function markMarker(raw: Buffer, records: HwpRecord[], marker: MarkerRef, code: number) {
  const textRecord = records[marker.headerIndex + 1];
  if (!textRecord || textRecord.tagId !== 67) return;
  raw.writeUInt16LE(code, textRecord.offset + marker.overwriteByteOffset);
}

export class HwpFormVersionMismatchError extends Error {
  constructor(formVersion: string) {
    super(
      `한글 파일은 ${HWP_TEMPLATE_FORM_VERSION}년 서식 템플릿만 지원합니다. ` +
        `이 기록은 ${formVersion}년 서식으로 작성되어 워드나 PDF로 내려받아 주세요.`
    );
    this.name = "HwpFormVersionMismatchError";
  }
}

export async function generateAssessmentHwp(
  responses: Responses,
  formVersion?: string | null
): Promise<Buffer> {
  const version = formVersion || HWP_TEMPLATE_FORM_VERSION;
  if (version !== HWP_TEMPLATE_FORM_VERSION) {
    throw new HwpFormVersionMismatchError(version);
  }

  const templateBytes = loadTemplateBytes();
  const cfb = CFB.read(templateBytes, { type: "buffer" });
  const entry = findBodyTextEntry(cfb);
  const originalCompressed = Buffer.from(entry.content as Buffer);
  const raw = Buffer.from(zlib.inflateRawSync(originalCompressed));
  const records = parseRecords(raw);

  for (const [code, entryMap] of Object.entries(fieldMapTyped)) {
    const field = fieldsByCode.get(code);
    if (!field) continue;
    const value = responses[code];
    if (value === undefined || value === null) continue;

    if (entryMap.kind === "scale4") {
      if (typeof value !== "string") continue;
      const idx = (field.options ?? []).indexOf(value);
      if (idx === -1) continue;
      const byteOffset = entryMap.puaByteOffsets[idx];
      if (byteOffset === undefined) continue;
      const textRecord = records[entryMap.headerIndex + 1];
      if (textRecord && textRecord.tagId === 67) {
        // the mark position is the visible space slot right after the glyph
        raw.writeUInt16LE(CHECKMARK_CODE, textRecord.offset + byteOffset + 4);
      }
      continue;
    }

    // kind === "options"
    const selected = (Array.isArray(value) ? value : [value]).filter(
      (v): v is string => typeof v === "string"
    );
    const options = field.options ?? [];
    for (const sel of selected) {
      const idx = options.indexOf(sel);
      if (idx === -1) continue;
      const marker = entryMap.options[idx];
      if (!marker) continue;
      const code2 = marker.kind === "box" ? CHECK_CHAR_CODE : CHECKMARK_CODE;
      markMarker(raw, records, marker, code2);
    }
  }

  const recompressed = zlib.deflateRawSync(raw);
  entry.content = recompressed;
  entry.size = recompressed.length;

  const out = CFB.write(cfb, { type: "buffer" });
  return Buffer.from(out as Buffer);
}
