import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { ASSESSMENT_SECTIONS, type Field } from "./assessment-form";

type Responses = Record<string, string | string[] | undefined>;

function loadFontBytes(file: string) {
  return readFileSync(path.join(process.cwd(), "src/assets/fonts", file));
}

function renderChoiceLine(field: Field, value: string | string[] | undefined): string {
  const selected = Array.isArray(value) ? value : value ? [value] : [];
  return (field.options ?? [])
    .map((opt) => `${selected.includes(opt) ? "■" : "□"} ${opt}`)
    .join("   ");
}

function fieldValueText(field: Field, responses: Responses): string {
  const value = responses[field.code];
  if (field.type === "select" || field.type === "scale4" || field.type === "multiselect") {
    return renderChoiceLine(field, value);
  }
  if (typeof value === "string" && value.trim()) {
    return field.suffix ? `${value} ${field.suffix}` : value;
  }
  return "-";
}

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN_X = 50;
const MARGIN_TOP = 60;
const MARGIN_BOTTOM = 50;
const MAX_WIDTH = PAGE_WIDTH - MARGIN_X * 2;

function wrapLine(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  if (!text) return [""];
  const lines: string[] = [];
  let current = "";
  for (const ch of text) {
    const trial = current + ch;
    if (font.widthOfTextAtSize(trial, size) > maxWidth && current) {
      lines.push(current);
      current = ch;
    } else {
      current = trial;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export async function generateAssessmentPdf(params: {
  recipientName: string;
  roundNo: number;
  assessedAt: string;
  authorName: string;
  responses: Responses;
  finalSummary: string;
}): Promise<Uint8Array> {
  const { recipientName, roundNo, assessedAt, authorName, responses, finalSummary } = params;

  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const bold = await doc.embedFont(loadFontBytes("NotoSansKR-Bold-subset.ttf"), { subset: false });
  const regular = await doc.embedFont(loadFontBytes("NotoSansKR-Regular-subset.ttf"), {
    subset: false,
  });

  const pine = rgb(0.118, 0.2, 0.153);
  const ink = rgb(0.149, 0.188, 0.165);
  const gray = rgb(0.45, 0.45, 0.45);

  let page: PDFPage = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN_TOP;

  function newPage() {
    page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    y = PAGE_HEIGHT - MARGIN_TOP;
  }

  function ensureSpace(lineHeight: number) {
    if (y - lineHeight < MARGIN_BOTTOM) newPage();
  }

  function drawText(
    text: string,
    opts: { font: PDFFont; size: number; color: typeof ink; bold?: boolean; gapAfter?: number }
  ) {
    const lineHeight = opts.size * 1.5;
    const lines = wrapLine(text, opts.font, opts.size, MAX_WIDTH);
    for (const line of lines) {
      ensureSpace(lineHeight);
      page.drawText(line, { x: MARGIN_X, y, size: opts.size, font: opts.font, color: opts.color });
      y -= lineHeight;
    }
    if (opts.gapAfter) y -= opts.gapAfter;
  }

  drawText("욕구조사기록지", { font: bold, size: 20, color: pine, gapAfter: 8 });
  drawText(
    `수급자: ${recipientName}   |   ${roundNo}회차   |   작성(방문사정)일: ${assessedAt}   |   작성자: ${authorName}`,
    { font: regular, size: 10, color: gray, gapAfter: 14 }
  );

  for (const section of ASSESSMENT_SECTIONS) {
    drawText(section.title, { font: bold, size: 14, color: pine, gapAfter: 4 });
    if (section.note) {
      drawText(section.note, { font: regular, size: 9, color: gray, gapAfter: 6 });
    }

    let lastGroup: string | undefined;
    for (const field of section.fields) {
      if (field.group && field.group !== lastGroup) {
        lastGroup = field.group;
        drawText(field.group, { font: bold, size: 10.5, color: ink, gapAfter: 2 });
      }
      drawText(`${field.label}: ${fieldValueText(field, responses)}`, {
        font: regular,
        size: 10,
        color: ink,
        gapAfter: 3,
      });
    }
  }

  drawText("10. 종합의견 (총평)", { font: bold, size: 14, color: pine, gapAfter: 6 });
  drawText(finalSummary || "-", { font: regular, size: 10.5, color: ink });

  return doc.save();
}
