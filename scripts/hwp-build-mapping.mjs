import CFB from "cfb";
import zlib from "node:zlib";
import { writeFileSync } from "node:fs";
import { ASSESSMENT_SECTIONS } from "../src/lib/assessment-form.ts";

const TEMPLATE_PATH = "C:/Users/tasman/Desktop/자동화/욕구사정.hwp";

const CHAR_KIND_CODES = new Set([0x00, 0x0a, 0x0d, 0x18, 0x1e, 0x1f]);
function controlCharUnitLen(code) {
  if (code >= 32) return 1;
  return CHAR_KIND_CODES.has(code) ? 1 : 8;
}

// Decode a PARA_TEXT record into a list of "visible 1-unit slots":
// { byteOffset, code, char }. Multi-unit control chars (incl. surrogate-pair
// PUA glyphs, which are NOT plain 1-unit chars) are skipped as opaque blocks
// but we still record PUA surrogate pairs specially since we need to mark them.
function decodeSlots(data) {
  const slots = [];
  let i = 0;
  while (i < data.length) {
    const code = data.readUInt16LE(i);
    if (code >= 0xd800 && code <= 0xdbff && i + 2 < data.length) {
      const low = data.readUInt16LE(i + 2);
      if (low >= 0xdc00 && low <= 0xdfff) {
        slots.push({ byteOffset: i, kind: "pua", high: code, low });
        i += 4;
        continue;
      }
    }
    const len = controlCharUnitLen(code);
    if (len === 1) {
      slots.push({ byteOffset: i, kind: "char", code, char: code >= 32 ? String.fromCharCode(code) : null });
    }
    i += len * 2;
  }
  return slots;
}

function slotsToText(slots) {
  return slots
    .filter((s) => s.kind === "char" && s.char)
    .map((s) => s.char)
    .join("");
}

const cfb = CFB.read(TEMPLATE_PATH, { type: "file" });
let entry = CFB.find(cfb, "BodyText/Section0");
if (!entry) {
  const idx = cfb.FullPaths.findIndex((p) => p.includes("BodyText/Section0"));
  entry = cfb.FileIndex[idx];
}
const raw = zlib.inflateRawSync(Buffer.from(entry.content));

let pos = 0;
const records = [];
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
  records.push({ tagId, level, size, data, offset: pos });
  pos += size;
}

const headerIndices = [];
const slotsByHeader = new Map(); // headerRecordIndex -> slots[]
for (let i = 0; i < records.length; i++) {
  if (records[i].tagId === 66) {
    headerIndices.push(i);
    const next = records[i + 1];
    if (next && next.tagId === 67) {
      slotsByHeader.set(i, decodeSlots(next.data));
    }
  }
}

// Extract ordered "checkbox markers" across the whole document:
// - box:    a "□" char slot -> mark by flipping to "■"
// - bracket: a literal "[", " ", "]" 3-slot run -> mark by overwriting the middle space with "√"
// each marker carries an associated label = the text immediately following it
// up to the next marker / ')' / end of paragraph.
const markers = []; // { headerIndex, kind: 'box'|'bracket'|'pua', overwriteByteOffset, label, seq }
let seq = 0;
for (const hIdx of headerIndices) {
  const slots = slotsByHeader.get(hIdx);
  if (!slots) continue;
  for (let i = 0; i < slots.length; i++) {
    const s = slots[i];
    if (s.kind === "char" && s.char === "□") {
      const label = collectLabel(slots, i + 1);
      markers.push({ headerIndex: hIdx, kind: "box", overwriteByteOffset: s.byteOffset, label, seq: seq++ });
    } else if (
      s.kind === "char" &&
      s.char === "[" &&
      slots[i + 1]?.char === " " &&
      slots[i + 2]?.char === "]"
    ) {
      const label = collectLabel(slots, i + 3);
      markers.push({
        headerIndex: hIdx,
        kind: "bracket",
        overwriteByteOffset: slots[i + 1].byteOffset,
        label,
        seq: seq++,
      });
    } else if (s.kind === "pua") {
      // PUA glyph used as an inline N-option selector (e.g. "1 있음   2 없음").
      // The mark position is the visible space slot immediately after the glyph.
      const afterGlyphByteOffset = s.byteOffset + 4;
      const spaceSlot = slots.find((sl) => sl.kind === "char" && sl.byteOffset === afterGlyphByteOffset);
      const label = collectLabel(slots, i + 1);
      markers.push({
        headerIndex: hIdx,
        kind: "pua",
        overwriteByteOffset: spaceSlot ? spaceSlot.byteOffset : afterGlyphByteOffset,
        label,
        seq: seq++,
      });
    }
  }
}

function collectLabel(slots, startIdx) {
  let out = "";
  for (let i = startIdx; i < slots.length; i++) {
    const s = slots[i];
    if (s.kind === "pua") break;
    if (s.kind === "char" && (s.char === "□" || s.char === "[")) break;
    if (s.kind === "char" && s.char) out += s.char;
  }
  return out.trim();
}

const norm = (s) => s.replace(/[\s,]/g, "");

// headerIndex -> position within headerIndices (document order)
const headerPos = new Map(headerIndices.map((h, i) => [h, i]));
// marker.seq -> its position within headerIndices (for local-window search)
for (const m of markers) m.headerPos = headerPos.get(m.headerIndex);

const allFields = ASSESSMENT_SECTIONS.flatMap((s) => s.fields);
const mapping = {};
const unmatchedFields = [];
const usedSeq = new Set();

function findLabelHeaderPos(label) {
  const idx = headerIndices.find((i) => {
    const slots = slotsByHeader.get(i);
    const text = slots ? slotsToText(slots) : "";
    // strip leading numbering like "1) " / "1. " / "가. "
    return text.replace(/^\s*(\d+\)|\d+\.|[가-힣]\.)\s*/, "").trim() === label;
  });
  return idx === undefined ? -1 : headerPos.get(idx);
}

// Find the earliest run of markers (searched only among those with
// headerPos >= minHeaderPos, and, if maxHeaderPos is given, <= maxHeaderPos)
// whose labels match `wanted` in order (prefix match, normalized). A matched
// marker whose label ends with "(" is followed by nested bracket sub-options
// belonging to THAT option (e.g. "투석([ ]혈액 [ ]복막)") - those are skipped,
// not treated as separate top-level options.
function findRun(wanted, minHeaderPos, maxHeaderPos) {
  const n = wanted.length;
  const pool = markers.filter(
    (m) => m.headerPos >= minHeaderPos && (maxHeaderPos === undefined || m.headerPos <= maxHeaderPos)
  );
  for (let start = 0; start < pool.length; start++) {
    if (usedSeq.has(pool[start].seq)) continue;
    let p = start;
    const matched = [];
    let ok = true;
    for (let k = 0; k < n; k++) {
      while (p < pool.length && usedSeq.has(pool[p].seq)) p++;
      const m = pool[p];
      if (!m || !norm(m.label).startsWith(wanted[k])) {
        ok = false;
        break;
      }
      matched.push(m);
      p++;
      if (m.label.endsWith("(")) {
        while (p < pool.length && pool[p].kind === "bracket") p++;
      }
    }
    if (ok) return matched;
  }
  return null;
}

function tryMapField(field, run) {
  if (!run) return false;
  const opts = [];
  for (const m of run) {
    usedSeq.add(m.seq);
    opts.push({ kind: m.kind, headerIndex: m.headerIndex, overwriteByteOffset: m.overwriteByteOffset });
  }
  mapping[field.code] = { kind: "options", options: opts };
  return true;
}

const optionFields = allFields.filter((f) => f.options && f.type !== "scale4");

// Pass 1: fields whose own label exists as a standalone paragraph - anchor
// locally right after it, so they claim their markers before anyone else can.
const deferred = [];
for (const field of optionFields) {
  const wanted = field.options.map(norm);
  const labelPos = findLabelHeaderPos(field.label);
  if (labelPos === -1) {
    deferred.push(field);
    continue;
  }
  const run = findRun(wanted, labelPos + 1, labelPos + 20 + wanted.length * 4);
  if (!tryMapField(field, run)) {
    unmatchedFields.push({ code: field.code, label: field.label, reason: "no marker run match (local)" });
  }
}

// Pass 2: fields with no locatable standalone label (e.g. label text is fused
// with its own checkbox prefix, or only a group header precedes it) - only
// now attempt an unbounded global search, after pass 1 has already claimed
// every marker it rightfully owns, so there is nothing left to steal.
for (const field of deferred) {
  const wanted = field.options.map(norm);
  const run = findRun(wanted, 0);
  if (!tryMapField(field, run)) {
    unmatchedFields.push({ code: field.code, label: field.label, reason: "no marker run match (global)" });
  }
}

// scale4 fields (0-3 ADL scale): the 4 PUA glyphs share one paragraph with no
// label text between them, so match by position (immediately after the item's
// own label paragraph) + glyph count, not by text content.
for (const field of allFields) {
  if (field.type !== "scale4") continue;
  const labelPos = findLabelHeaderPos(field.label);
  if (labelPos === -1) {
    unmatchedFields.push({ code: field.code, label: field.label, reason: "scale4 label not found" });
    continue;
  }
  let found = null;
  for (let k = labelPos + 1; k < Math.min(labelPos + 4, headerIndices.length); k++) {
    const hIdx = headerIndices[k];
    const slots = slotsByHeader.get(hIdx) ?? [];
    const puaSlots = slots.filter((s) => s.kind === "pua");
    if (puaSlots.length === 4) {
      found = { headerIndex: hIdx, puaByteOffsets: puaSlots.map((s) => s.byteOffset) };
      break;
    }
  }
  if (!found) {
    unmatchedFields.push({ code: field.code, label: field.label, reason: "scale4 glyph cell not found" });
    continue;
  }
  mapping[field.code] = { kind: "scale4", headerIndex: found.headerIndex, puaByteOffsets: found.puaByteOffsets };
}

console.log("total fields:", allFields.length);
console.log("mapped:", Object.keys(mapping).length);
console.log("unmatched:", unmatchedFields.length);
for (const u of unmatchedFields) {
  console.log("  -", u.code, JSON.stringify(u.label), u.reason);
}
console.log("total markers:", markers.length, "used:", usedSeq.size);

const outPath = new URL("../src/assets/forms/hwp-field-map.json", import.meta.url);
writeFileSync(outPath, JSON.stringify(mapping, null, 2), "utf8");
console.log("written mapping to", outPath.pathname);
