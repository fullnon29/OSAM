import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import CFB from "cfb";
import { parseRecords, type HwpRecord } from "./hwp/record-stream";
import { ASSESSMENT_SECTIONS } from "./assessment-form";
import fieldMap from "@/assets/forms/hwp-field-map.json";

type Responses = Record<string, string | string[] | undefined>;

type MarkerRef = { kind: "box" | "bracket" | "pua"; headerIndex: number; overwriteByteOffset: number };
type FieldMapEntry =
  | { kind: "options"; options: MarkerRef[] }
  | { kind: "scale4"; headerIndex: number; puaByteOffsets: number[] };

const fieldMapTyped = fieldMap as Record<string, FieldMapEntry>;
const allFields = ASSESSMENT_SECTIONS.flatMap((s) => s.fields);
const fieldsByCode = new Map(allFields.map((f) => [f.code, f]));

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

export async function generateAssessmentHwp(responses: Responses): Promise<Buffer> {
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
    const selected = Array.isArray(value) ? value : [value];
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
