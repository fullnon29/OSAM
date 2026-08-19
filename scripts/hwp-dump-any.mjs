import CFB from "cfb";
import zlib from "node:zlib";
import { writeFileSync } from "node:fs";

const filePath = process.argv[2];
const outPath = process.argv[3];

const CHAR_KIND_CODES = new Set([0x00, 0x0a, 0x0d, 0x18, 0x1e, 0x1f]);
function controlCharUnitLen(code) {
  if (code >= 32) return 1;
  return CHAR_KIND_CODES.has(code) ? 1 : 8;
}
function decodeParaText(data) {
  let out = "";
  let i = 0;
  while (i < data.length) {
    const code = data.readUInt16LE(i);
    if (code >= 0xd800 && code <= 0xdbff && i + 2 < data.length) {
      const low = data.readUInt16LE(i + 2);
      if (low >= 0xdc00 && low <= 0xdfff) {
        out += "○"; // represent PUA glyph as a circle placeholder
        i += 4;
        continue;
      }
    }
    const units = controlCharUnitLen(code);
    if (code >= 32) out += String.fromCharCode(code);
    i += units * 2;
  }
  return out;
}
function decodeParaHeader(data) {
  const flags = data.readUInt32LE(0);
  return { chars: flags & 0x7fffffff };
}

const cfb = CFB.read(filePath, { type: "file" });
console.log("streams:", cfb.FullPaths.filter((p) => p.includes("BodyText")).join(", "));

const sectionEntries = cfb.FullPaths
  .map((p, i) => ({ p, i }))
  .filter((x) => x.p.includes("BodyText/Section"));

const lines = [];
for (const { p, i } of sectionEntries) {
  const entry = cfb.FileIndex[i];
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
  lines.push(`=== ${p} (${records.length} records) ===`);
  for (let idx = 0; idx < records.length; idx++) {
    const r = records[idx];
    if (r.tagId === 66) {
      const hdr = decodeParaHeader(r.data);
      const next = records[idx + 1];
      let text = "[BLANK]";
      if (next && next.tagId === 67) text = decodeParaText(next.data);
      lines.push(`${idx}\tL${r.level}\tchars=${hdr.chars}\t${text}`);
    }
  }
}

writeFileSync(outPath, lines.join("\n"), "utf8");
console.log("total paragraphs written:", lines.length);
