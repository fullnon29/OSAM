import "server-only";

// HWP v5 (binary, OLE compound file) BodyText section record stream utilities.
// Record header: 32-bit LE. bits0-9=tagId, bits10-19=level, bits20-31=size
// (size===0xFFF -> next 4 bytes are the real size, uint32).
//
// Inline control chars (codes 0-31 within PARA_TEXT):
// - "CHAR" kind (1 unit / 2 bytes total): 0x00,0x0a,0x0d,0x18,0x1e,0x1f
// - everything else 0-31 is "INLINE"/"EXTENDED" (8 units / 16 bytes total,
//   i.e. the code unit + 7 more units of parameter data).
const CHAR_KIND_CODES = new Set([0x00, 0x0a, 0x0d, 0x18, 0x1e, 0x1f]);

export function controlCharUnitLen(code: number): number {
  if (code >= 32) return 1;
  return CHAR_KIND_CODES.has(code) ? 1 : 8;
}

export type HwpRecord = {
  tagId: number;
  level: number;
  size: number;
  data: Buffer;
  /** absolute byte offset of `data` within the raw (decompressed) stream */
  offset: number;
};

export const HWPTAG_PARA_HEADER = 66;
export const HWPTAG_PARA_TEXT = 67;

export function parseRecords(raw: Buffer): HwpRecord[] {
  const records: HwpRecord[] = [];
  let pos = 0;
  while (pos < raw.length) {
    const header = raw.readUInt32LE(pos);
    const tagId = header & 0x3ff;
    const level = (header >> 10) & 0x3ff;
    let size = (header >> 20) & 0xfff;
    pos += 4;
    if (size === 0xfff) {
      size = raw.readUInt32LE(pos);
      pos += 4;
    }
    const data = raw.subarray(pos, pos + size);
    records.push({ tagId, level, size, data: Buffer.from(data), offset: pos });
    pos += size;
  }
  return records;
}

export function serializeRecords(records: HwpRecord[]): Buffer {
  const chunks: Buffer[] = [];
  for (const r of records) {
    if (r.size < 0xfff) {
      const header = Buffer.alloc(4);
      header.writeUInt32LE((r.tagId & 0x3ff) | ((r.level & 0x3ff) << 10) | ((r.size & 0xfff) << 20), 0);
      chunks.push(header, r.data);
    } else {
      const header = Buffer.alloc(8);
      header.writeUInt32LE((r.tagId & 0x3ff) | ((r.level & 0x3ff) << 10) | (0xfff << 20), 0);
      header.writeUInt32LE(r.size, 4);
      chunks.push(header, r.data);
    }
  }
  return Buffer.concat(chunks);
}

// Decode a PARA_TEXT record's raw bytes into a plain string (control chars other
// than break/tab dropped; positions of visible-unit boundaries are NOT preserved
// here - use decodeParaTextUnits for position-aware access).
export function decodeParaText(data: Buffer): string {
  let out = "";
  let i = 0;
  while (i < data.length) {
    const code = data.readUInt16LE(i);
    const units = controlCharUnitLen(code);
    if (code >= 32) out += String.fromCharCode(code);
    i += units * 2;
  }
  return out;
}

export type ParaTextUnit = {
  /** byte offset within the PARA_TEXT record's data */
  byteOffset: number;
  /** decoded char (for visible units); undefined for control-char units */
  char?: string;
  code: number;
};

// Decode preserving byte-offset for every "visible" 1-unit slot (code>=32),
// which is what we need to safely overwrite specific characters in place.
export function decodeParaTextUnits(data: Buffer): ParaTextUnit[] {
  const units: ParaTextUnit[] = [];
  let i = 0;
  while (i < data.length) {
    const code = data.readUInt16LE(i);
    const len = controlCharUnitLen(code);
    if (len === 1) {
      units.push({ byteOffset: i, code, char: code >= 32 ? String.fromCharCode(code) : undefined });
    }
    i += len * 2;
  }
  return units;
}

export function decodeParaHeaderChars(data: Buffer): number {
  const flags = data.readUInt32LE(0);
  return flags & 0x7fffffff;
}

export function encodeParaHeaderChars(data: Buffer, chars: number): Buffer {
  const out = Buffer.from(data);
  const flags = out.readUInt32LE(0);
  const unknownBit = flags & 0x80000000;
  out.writeUInt32LE(unknownBit | (chars & 0x7fffffff), 0);
  return out;
}
