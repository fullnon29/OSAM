// 엑셀 파일을 읽고 씁니다.
//
// 바깥 꾸러미를 새로 들이지 않았습니다. xlsx 는 결국 zip 에 담긴 XML 이고,
// 우리에게 필요한 것은 '칸에 적힌 글자'뿐이라 그만큼만 다룹니다. zip 은 이미
// 들어와 있는 jszip 을 씁니다.
//
// 서식·수식·그림은 읽지 않습니다. 기준표에는 글자와 숫자만 들어 있고,
// 보고서는 우리가 새로 만들기 때문입니다.

import JSZip from "jszip";
import { readFile, writeFile } from "node:fs/promises";

export type Sheet = { name: string; rows: string[][] };

/* ── 읽기 ──────────────────────────────────────────────────── */

/** XML 에서 &amp; 같은 표기를 원래 글자로 되돌립니다. */
function unescapeXml(s: string): string {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_m, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/**
 * <t> 조각들을 이어 붙입니다.
 *
 * 한 칸의 글자가 여러 <t> 로 쪼개져 있는 경우가 있습니다(글자마다 서식이
 * 다르면 그렇게 저장됩니다). 이어 붙이지 않으면 "필요시" 가 "필"·"요시" 로
 * 갈라져 기준을 알아보지 못합니다.
 */
function joinText(xml: string): string {
  let out = "";
  const re = /<t\b[^>]*\/>|<t\b[^>]*>([\s\S]*?)<\/t>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) out += m[1] ? unescapeXml(m[1]) : "";
  return out;
}

/** "BC" 같은 열 이름을 0부터 세는 번호로 바꿉니다. */
function columnIndex(ref: string): number {
  const letters = ref.replace(/[0-9]/g, "");
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** 시트 XML 한 장을 표로 폅니다. 빈 칸은 빈 글자로 채웁니다. */
function parseSheet(xml: string, shared: string[]): string[][] {
  const rows: string[][] = [];

  const rowRe = /<row\b([^>]*)>([\s\S]*?)<\/row>/g;
  let rowMatch: RegExpExecArray | null;
  while ((rowMatch = rowRe.exec(xml))) {
    const attrs = rowMatch[1];
    const body = rowMatch[2];
    const rNo = /\br="(\d+)"/.exec(attrs);
    // 줄 번호가 적혀 있으면 그 자리에 놓습니다. 빈 줄이 생략돼 있어도
    // 기준표의 줄 번호와 어긋나지 않아야 보고서에서 되짚을 수 있습니다.
    const rowIndex = rNo ? Number(rNo[1]) - 1 : rows.length;
    while (rows.length <= rowIndex) rows.push([]);
    const cells = rows[rowIndex];

    const cellRe = /<c\b([^>]*?)\/>|<c\b([^>]*?)>([\s\S]*?)<\/c>/g;
    let cellMatch: RegExpExecArray | null;
    let cursor = 0;
    while ((cellMatch = cellRe.exec(body))) {
      const cellAttrs = cellMatch[1] ?? cellMatch[2] ?? "";
      const inner = cellMatch[3] ?? "";
      const ref = /\br="([A-Z]+\d+)"/.exec(cellAttrs);
      const col = ref ? columnIndex(ref[1]) : cursor;
      cursor = col + 1;

      const type = /\bt="([^"]+)"/.exec(cellAttrs)?.[1] ?? "n";
      let text = "";
      if (type === "s") {
        const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];
        text = v ? (shared[Number(v)] ?? "") : "";
      } else if (type === "inlineStr") {
        text = joinText(inner);
      } else {
        const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];
        text = v ? unescapeXml(v) : "";
      }

      while (cells.length <= col) cells.push("");
      cells[col] = text.trim();
    }
  }
  return rows;
}

/** 엑셀 파일의 모든 시트를 표로 읽습니다. */
export async function readWorkbook(file: string): Promise<Sheet[]> {
  const zip = await JSZip.loadAsync(await readFile(file));

  const sharedXml = (await zip.file("xl/sharedStrings.xml")?.async("string")) ?? "";
  const shared: string[] = [];
  const siRe = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
  let si: RegExpExecArray | null;
  while ((si = siRe.exec(sharedXml))) shared.push(joinText(si[1]));

  // 시트 이름과 실제 파일 위치는 따로 적혀 있습니다. 이름은 workbook.xml 에,
  // 파일 이름은 관계 파일(rels)에 있어 둘을 맞춰 봐야 합니다.
  const bookXml = (await zip.file("xl/workbook.xml")?.async("string")) ?? "";
  const relsXml = (await zip.file("xl/_rels/workbook.xml.rels")?.async("string")) ?? "";

  const targets = new Map<string, string>();
  const relRe = /<Relationship\b([^>]*)\/>/g;
  let rel: RegExpExecArray | null;
  while ((rel = relRe.exec(relsXml))) {
    const id = /\bId="([^"]+)"/.exec(rel[1])?.[1];
    const target = /\bTarget="([^"]+)"/.exec(rel[1])?.[1];
    if (id && target) targets.set(id, target.replace(/^\/?xl\//, "").replace(/^\//, ""));
  }

  const sheets: Sheet[] = [];
  const sheetRe = /<sheet\b([^>]*)\/>/g;
  let sh: RegExpExecArray | null;
  let ordinal = 0;
  while ((sh = sheetRe.exec(bookXml))) {
    ordinal++;
    const name = unescapeXml(/\bname="([^"]*)"/.exec(sh[1])?.[1] ?? "시트" + ordinal);
    const rid = /\br:id="([^"]+)"/.exec(sh[1])?.[1];
    const path = (rid && targets.get(rid)) || "worksheets/sheet" + ordinal + ".xml";
    const xml = await zip.file("xl/" + path)?.async("string");
    if (!xml) continue;
    sheets.push({ name, rows: parseSheet(xml, shared) });
  }
  return sheets;
}

/* ── 쓰기 ──────────────────────────────────────────────────── */

export type Cell = string | number | null | undefined;
export type OutSheet = {
  name: string;
  /** 첫 줄은 제목 줄로 보고 굵게 칠합니다. */
  rows: Cell[][];
  /** 열 너비(글자 수). 적지 않으면 엑셀 기본값을 씁니다. */
  widths?: number[];
};

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    // 제어문자가 남아 있으면 엑셀이 "파일이 손상되었다"며 열지 않습니다.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
}

function columnName(index: number): string {
  let n = index + 1;
  let out = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

/** 시트 이름에 쓸 수 없는 글자를 걷어 내고 31자로 자릅니다. */
function safeSheetName(name: string, fallback: string): string {
  const cleaned = name.replace(/[\\/*?:[\]]/g, " ").trim();
  return (cleaned || fallback).slice(0, 31);
}

function sheetXml(sheet: OutSheet): string {
  const widths = sheet.widths ?? [];
  const cols = widths.length
    ? "<cols>" +
      widths
        .map((w, i) => '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>')
        .join("") +
      "</cols>"
    : "";

  const rows = sheet.rows
    .map((row, r) => {
      const cells = row
        .map((value, c) => {
          if (value === null || value === undefined || value === "") return "";
          const ref = columnName(c) + (r + 1);
          const style = r === 0 ? ' s="1"' : "";
          if (typeof value === "number" && Number.isFinite(value)) {
            return '<c r="' + ref + '"' + style + "><v>" + value + "</v></c>";
          }
          // 글자는 공유 문자열 대신 칸 안에 바로 넣습니다. 파일이 조금
          // 커지는 대신 만드는 쪽이 단순해 어긋날 여지가 없습니다.
          return (
            '<c r="' + ref + '"' + style + ' t="inlineStr"><is><t xml:space="preserve">' +
            escapeXml(String(value)) +
            "</t></is></c>"
          );
        })
        .join("");
      return '<row r="' + (r + 1) + '">' + cells + "</row>";
    })
    .join("");

  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    cols +
    "<sheetData>" + rows + "</sheetData></worksheet>"
  );
}

/** 표 여러 장을 엑셀 파일 하나로 저장합니다. */
export async function writeWorkbook(file: string, sheets: OutSheet[]): Promise<void> {
  const zip = new JSZip();
  const names = sheets.map((s, i) => safeSheetName(s.name, "시트" + (i + 1)));

  zip.file(
    "[Content_Types].xml",
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      sheets
        .map(
          (_s, i) =>
            '<Override PartName="/xl/worksheets/sheet' + (i + 1) +
            '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
        )
        .join("") +
      "</Types>"
  );

  zip.file(
    "_rels/.rels",
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
      "</Relationships>"
  );

  zip.file(
    "xl/workbook.xml",
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
      names
        .map((name, i) => '<sheet name="' + escapeXml(name) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>')
        .join("") +
      "</sheets></workbook>"
  );

  zip.file(
    "xl/_rels/workbook.xml.rels",
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      sheets
        .map(
          (_s, i) =>
            '<Relationship Id="rId' + (i + 1) +
            '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' +
            (i + 1) + '.xml"/>'
        )
        .join("") +
      '<Relationship Id="rId' + (sheets.length + 1) +
      '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
      "</Relationships>"
  );

  // 제목 줄만 굵게 하는 최소한의 서식입니다.
  zip.file(
    "xl/styles.xml",
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<fonts count="2"><font><sz val="11"/><name val="맑은 고딕"/></font>' +
      "<font><b/><sz val=\"11\"/><name val=\"맑은 고딕\"/></font></fonts>" +
      '<fills count="2"><fill><patternFill patternType="none"/></fill>' +
      '<fill><patternFill patternType="gray125"/></fill></fills>' +
      '<borders count="1"><border/></borders>' +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
      '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>' +
      "</styleSheet>"
  );

  sheets.forEach((sheet, i) => zip.file("xl/worksheets/sheet" + (i + 1) + ".xml", sheetXml(sheet)));

  const buffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  await writeFile(file, buffer);
}
