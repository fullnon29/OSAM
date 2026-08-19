import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";
import { PDFDocument, rgb, type PDFFont, type PDFPage, type Color } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { ASSESSMENT_SECTIONS, type Field } from "./assessment-form";

type Responses = Record<string, string | string[] | number | undefined>;

function loadFontBytes(file: string) {
  return readFileSync(path.join(process.cwd(), "src/assets/fonts", file));
}

// The embedded Korean font subset only covers Hangul + basic ASCII, so any
// other character (e.g. the middle dot used in a few labels) must be swapped
// for a safe ASCII fallback before drawing, or it silently renders as a
// different, wrong glyph.
function sanitizeForPdfFont(text: string): string {
  return text.replace(/·/g, "-");
}

type ChoiceItem = { label: string; checked: boolean };
type ValueContent = { kind: "text"; text: string } | { kind: "choices"; items: ChoiceItem[] };

function fieldValueContent(field: Field, responses: Responses): ValueContent {
  const value = responses[field.code];
  if (field.type === "select" || field.type === "scale4" || field.type === "multiselect") {
    const selected = Array.isArray(value) ? value : value !== undefined ? [String(value)] : [];
    return {
      kind: "choices",
      items: (field.options ?? []).map((opt) => ({
        label: sanitizeForPdfFont(opt),
        checked: selected.includes(opt),
      })),
    };
  }
  if ((typeof value === "string" && value.trim()) || typeof value === "number") {
    const text = field.suffix ? `${value} ${field.suffix}` : String(value);
    return { kind: "text", text: sanitizeForPdfFont(text) };
  }
  return { kind: "text", text: "-" };
}

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN_X = 36;
const MARGIN_TOP = 46;
const MARGIN_BOTTOM = 40;
const TABLE_WIDTH = PAGE_WIDTH - MARGIN_X * 2;
const LABEL_COL_WIDTH = 150;
const VALUE_COL_WIDTH = TABLE_WIDTH - LABEL_COL_WIDTH;
const CELL_PAD_X = 6;
const ROW_PAD_Y = 4;
const FONT_SIZE = 8.5;
const LINE_HEIGHT = FONT_SIZE * 1.35;
const BOX_SIZE = FONT_SIZE * 0.85;
const BOX_GAP = 3;
const ITEM_GAP = 9;

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

// Greedily wraps checkbox items into lines, keeping each box+label pair
// intact (never split across lines).
function wrapChoices(items: ChoiceItem[], font: PDFFont, size: number, maxWidth: number): ChoiceItem[][] {
  const lines: ChoiceItem[][] = [];
  let current: ChoiceItem[] = [];
  let currentWidth = 0;
  for (const item of items) {
    const itemWidth = BOX_SIZE + BOX_GAP + font.widthOfTextAtSize(item.label, size) + ITEM_GAP;
    if (current.length > 0 && currentWidth + itemWidth > maxWidth) {
      lines.push(current);
      current = [];
      currentWidth = 0;
    }
    current.push(item);
    currentWidth += itemWidth;
  }
  if (current.length > 0) lines.push(current);
  if (lines.length === 0) lines.push([]);
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
  const line = rgb(0.7, 0.68, 0.63);
  const groupFill = rgb(0.95, 0.93, 0.88);

  let page: PDFPage = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN_TOP;

  function newPage() {
    page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    y = PAGE_HEIGHT - MARGIN_TOP;
  }

  function ensureSpace(needed: number) {
    if (y - needed < MARGIN_BOTTOM) newPage();
  }

  function drawFreeText(
    text: string,
    opts: { font: PDFFont; size: number; color: Color; gapAfter?: number; maxWidth?: number }
  ) {
    const maxWidth = opts.maxWidth ?? TABLE_WIDTH;
    const lineHeight = opts.size * 1.5;
    const lines = wrapLine(sanitizeForPdfFont(text), opts.font, opts.size, maxWidth);
    for (const l of lines) {
      ensureSpace(lineHeight);
      page.drawText(l, { x: MARGIN_X, y, size: opts.size, font: opts.font, color: opts.color });
      y -= lineHeight;
    }
    if (opts.gapAfter) y -= opts.gapAfter;
  }

  function drawChoiceLine(items: ChoiceItem[], x: number, textY: number) {
    let cx = x;
    const boxY = textY - BOX_SIZE * 0.12;
    for (const item of items) {
      page.drawRectangle({
        x: cx,
        y: boxY,
        width: BOX_SIZE,
        height: BOX_SIZE,
        borderColor: ink,
        borderWidth: 0.7,
        color: item.checked ? ink : undefined,
      });
      cx += BOX_SIZE + BOX_GAP;
      page.drawText(item.label, { x: cx, y: textY, size: FONT_SIZE, font: regular, color: ink });
      cx += regular.widthOfTextAtSize(item.label, FONT_SIZE) + ITEM_GAP;
    }
  }

  function drawTableRow(labelText: string, value: ValueContent) {
    const labelLines = wrapLine(sanitizeForPdfFont(labelText), bold, FONT_SIZE, LABEL_COL_WIDTH - CELL_PAD_X * 2);
    const valueWidth = VALUE_COL_WIDTH - CELL_PAD_X * 2;
    const valueLineCount =
      value.kind === "text"
        ? wrapLine(value.text, regular, FONT_SIZE, valueWidth).length
        : wrapChoices(value.items, regular, FONT_SIZE, valueWidth).length;

    const rowLines = Math.max(labelLines.length, valueLineCount, 1);
    const rowHeight = rowLines * LINE_HEIGHT + ROW_PAD_Y * 2;

    ensureSpace(rowHeight);

    const rowTop = y;
    const rowBottom = y - rowHeight;

    page.drawRectangle({
      x: MARGIN_X,
      y: rowBottom,
      width: TABLE_WIDTH,
      height: rowHeight,
      borderColor: line,
      borderWidth: 0.6,
    });
    page.drawLine({
      start: { x: MARGIN_X + LABEL_COL_WIDTH, y: rowTop },
      end: { x: MARGIN_X + LABEL_COL_WIDTH, y: rowBottom },
      color: line,
      thickness: 0.6,
    });

    let ly = rowTop - ROW_PAD_Y - FONT_SIZE;
    for (const l of labelLines) {
      page.drawText(l, {
        x: MARGIN_X + CELL_PAD_X,
        y: ly,
        size: FONT_SIZE,
        font: bold,
        color: ink,
      });
      ly -= LINE_HEIGHT;
    }

    let vy = rowTop - ROW_PAD_Y - FONT_SIZE;
    if (value.kind === "text") {
      for (const l of wrapLine(value.text, regular, FONT_SIZE, valueWidth)) {
        page.drawText(l, {
          x: MARGIN_X + LABEL_COL_WIDTH + CELL_PAD_X,
          y: vy,
          size: FONT_SIZE,
          font: regular,
          color: ink,
        });
        vy -= LINE_HEIGHT;
      }
    } else {
      for (const choiceLine of wrapChoices(value.items, regular, FONT_SIZE, valueWidth)) {
        drawChoiceLine(choiceLine, MARGIN_X + LABEL_COL_WIDTH + CELL_PAD_X, vy);
        vy -= LINE_HEIGHT;
      }
    }

    y = rowBottom;
  }

  function drawGroupRow(text: string) {
    const rowHeight = LINE_HEIGHT + ROW_PAD_Y * 2;
    ensureSpace(rowHeight);
    const rowTop = y;
    const rowBottom = y - rowHeight;
    page.drawRectangle({
      x: MARGIN_X,
      y: rowBottom,
      width: TABLE_WIDTH,
      height: rowHeight,
      color: groupFill,
      borderColor: line,
      borderWidth: 0.6,
    });
    page.drawText(sanitizeForPdfFont(text), {
      x: MARGIN_X + CELL_PAD_X,
      y: rowTop - ROW_PAD_Y - FONT_SIZE,
      size: FONT_SIZE,
      font: bold,
      color: pine,
    });
    y = rowBottom;
  }

  // header
  drawFreeText("욕구조사기록지", { font: bold, size: 18, color: pine, gapAfter: 6 });
  drawFreeText(
    `수급자: ${recipientName}   |   ${roundNo}회차   |   작성(방문사정)일: ${assessedAt}   |   작성자: ${authorName}`,
    { font: regular, size: 9.5, color: gray, gapAfter: 12 }
  );

  for (const section of ASSESSMENT_SECTIONS) {
    ensureSpace(LINE_HEIGHT * 1.6 + 6);
    drawFreeText(section.title, { font: bold, size: 12.5, color: pine, gapAfter: section.note ? 2 : 4 });
    if (section.note) {
      drawFreeText(section.note, { font: regular, size: 8, color: gray, gapAfter: 5 });
    }

    let lastGroup: string | undefined;
    for (const field of section.fields) {
      if (field.group && field.group !== lastGroup) {
        lastGroup = field.group;
        drawGroupRow(field.group);
      }
      const suffixLabel = field.suffix ? `${field.label} (${field.suffix})` : field.label;
      drawTableRow(suffixLabel, fieldValueContent(field, responses));
    }
    y -= 10;
  }

  ensureSpace(LINE_HEIGHT * 1.6 + 6);
  drawFreeText("10. 종합의견 (총평)", { font: bold, size: 12.5, color: pine, gapAfter: 6 });
  {
    const text = sanitizeForPdfFont(finalSummary || "-");
    const lines = wrapLine(text, regular, FONT_SIZE + 0.5, TABLE_WIDTH - CELL_PAD_X * 2);
    const boxHeight = lines.length * LINE_HEIGHT + ROW_PAD_Y * 2;
    ensureSpace(boxHeight);
    const boxTop = y;
    const boxBottom = y - boxHeight;
    page.drawRectangle({
      x: MARGIN_X,
      y: boxBottom,
      width: TABLE_WIDTH,
      height: boxHeight,
      borderColor: line,
      borderWidth: 0.6,
    });
    let ty = boxTop - ROW_PAD_Y - FONT_SIZE;
    for (const l of lines) {
      page.drawText(l, {
        x: MARGIN_X + CELL_PAD_X,
        y: ty,
        size: FONT_SIZE + 0.5,
        font: regular,
        color: ink,
      });
      ty -= LINE_HEIGHT;
    }
    y = boxBottom;
  }

  return doc.save();
}
