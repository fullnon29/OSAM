import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";
import { PDFDocument, rgb, type PDFFont, type PDFPage, type Color } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { ASSESSMENT_SECTIONS, type Field } from "./assessment-form";
import { measureText, drawTextRun as drawTextRunOnPage } from "./pdf-text";
import { recipientInfoPairs, type RecipientInfo } from "./assessment-recipient";
import { formatBmi } from "./assessment-metrics";

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

function selectedValues(value: Responses[string]): string[] {
  return Array.isArray(value) ? value : value !== undefined ? [String(value)] : [];
}

function toChoiceItems(options: string[], selected: string[]): ChoiceItem[] {
  return options.map((opt) => ({
    label: sanitizeForPdfFont(opt),
    checked: selected.includes(opt),
  }));
}

function fieldValueContent(field: Field, responses: Responses): ValueContent {
  const value = responses[field.code];
  if (field.type === "select" || field.type === "scale4" || field.type === "multiselect") {
    return { kind: "choices", items: toChoiceItems(field.options ?? [], selectedValues(value)) };
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
const BOX_GAP = 4;
const ITEM_GAP = 12;
// 절 제목 주변 여백: 제목이 아래 표에 붙어 보이도록 위쪽을 아래쪽보다 넓게 둡니다.
const SECTION_TITLE_SIZE = 12.5;
const SECTION_GAP_BEFORE = 18;
const SECTION_GAP_AFTER = 7;

// pdf-lib's drawText auto-advances to a new line internally when the string
// contains a literal "\n", which our own y-cursor bookkeeping knows nothing
// about - so any embedded newline (e.g. paragraph breaks in AI-generated
// text) must be split into separate hard lines here, never left inside a
// single string handed to drawText, or the next line we draw overlaps it.
function wrapLine(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  if (!text) return [""];
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let current = "";
    for (const ch of paragraph) {
      const trial = current + ch;
      if (measureText(trial, font, size) > maxWidth && current) {
        lines.push(current);
        current = ch;
      } else {
        current = trial;
      }
    }
    lines.push(current);
  }
  return lines;
}

// Greedily wraps checkbox items into lines, keeping each box+label pair
// intact (never split across lines).
function wrapChoices(items: ChoiceItem[], font: PDFFont, size: number, maxWidth: number): ChoiceItem[][] {
  const lines: ChoiceItem[][] = [];
  let current: ChoiceItem[] = [];
  let currentWidth = 0;
  for (const item of items) {
    const itemWidth = BOX_SIZE + BOX_GAP + measureText(item.label, font, size) + ITEM_GAP;
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
  recipient: RecipientInfo;
  roundNo: number;
  assessedAt: string;
  authorName: string;
  responses: Responses;
  finalSummary: string;
}): Promise<Uint8Array> {
  const { recipient, roundNo, assessedAt, authorName, responses, finalSummary } = params;

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

  // Draws one line of text word by word (see pdf-text.ts) against whichever
  // page is current, so the rendered width always matches measureText.
  function drawTextRun(
    text: string,
    x: number,
    textY: number,
    font: PDFFont,
    size: number,
    color: Color
  ) {
    drawTextRunOnPage(page, text, x, textY, font, size, color);
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
      drawTextRun(l, MARGIN_X, y, opts.font, opts.size, opts.color);
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
      drawTextRun(item.label, cx, textY, regular, FONT_SIZE, ink);
      cx += measureText(item.label, regular, FONT_SIZE) + ITEM_GAP;
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
      drawTextRun(l, MARGIN_X + CELL_PAD_X, ly, bold, FONT_SIZE, ink);
      ly -= LINE_HEIGHT;
    }

    let vy = rowTop - ROW_PAD_Y - FONT_SIZE;
    if (value.kind === "text") {
      for (const l of wrapLine(value.text, regular, FONT_SIZE, valueWidth)) {
        drawTextRun(l, MARGIN_X + LABEL_COL_WIDTH + CELL_PAD_X, vy, regular, FONT_SIZE, ink);
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
    drawTextRun(
      sanitizeForPdfFont(text),
      MARGIN_X + CELL_PAD_X,
      rowTop - ROW_PAD_Y - FONT_SIZE,
      bold,
      FONT_SIZE,
      pine
    );
    y = rowBottom;
  }

  // header
  drawFreeText("욕구조사기록지", { font: bold, size: 18, color: pine, gapAfter: 6 });
  drawFreeText(
    `${roundNo}회차   |   작성(방문사정)일: ${assessedAt}   |   작성자: ${authorName}`,
    { font: regular, size: 9.5, color: gray, gapAfter: 10 }
  );

  // 원본 서식 1. 일반사항의 수급자 인적사항 칸
  drawGroupRow("수급자");
  for (const [label, value] of recipientInfoPairs(recipient)) {
    drawTableRow(label, { kind: "text", text: sanitizeForPdfFont(value) });
  }

  for (const section of ASSESSMENT_SECTIONS) {
    // 제목은 아래 표와 한 덩어리로 읽혀야 하므로 위쪽 여백을 아래쪽보다 넓게 두고,
    // 제목만 페이지 끝에 홀로 남지 않도록 첫 줄까지 들어갈 자리를 함께 확보합니다.
    ensureSpace(SECTION_GAP_BEFORE + SECTION_TITLE_SIZE + SECTION_GAP_AFTER + LINE_HEIGHT * 3);
    y -= SECTION_GAP_BEFORE;
    drawTextRun(section.title, MARGIN_X, y - SECTION_TITLE_SIZE, bold, SECTION_TITLE_SIZE, pine);
    y -= SECTION_TITLE_SIZE + (section.note ? 3 : SECTION_GAP_AFTER);
    if (section.note) {
      drawTextRun(section.note, MARGIN_X, y - 8, regular, 8, gray);
      y -= 8 + SECTION_GAP_AFTER;
    }

    let lastGroup: string | undefined;
    for (const field of section.fields) {
      if (field.group && field.group !== lastGroup) {
        lastGroup = field.group;
        drawGroupRow(field.group);
      }
      if (field.optionGroups) {
        // 원본 서식처럼 선택지를 계통별 줄로 나눠 그립니다.
        const selected = selectedValues(responses[field.code]);
        field.optionGroups.forEach((g, i) => {
          drawTableRow(i === 0 ? field.label : `  ${sanitizeForPdfFont(g.label)}`, {
            kind: "choices",
            items: toChoiceItems(g.options, selected),
          });
        });
        continue;
      }
      const suffixLabel = field.suffix ? `${field.label} (${field.suffix})` : field.label;
      drawTableRow(suffixLabel, fieldValueContent(field, responses));
      // 원본 서식은 키/체중 옆에 BMI 칸이 있습니다. 입력값이 아니라 계산값이므로
      // 체중 바로 뒤에 자동으로 채워 넣습니다.
      if (field.code === "s2_weight") {
        drawTableRow("BMI", {
          kind: "text",
          text: formatBmi(responses["s2_height"], responses["s2_weight"]),
        });
      }
    }
    // 다음 절 제목의 SECTION_GAP_BEFORE가 표 사이 여백 역할을 하므로 여기서는 더하지 않습니다.
  }

  ensureSpace(SECTION_GAP_BEFORE + SECTION_TITLE_SIZE + SECTION_GAP_AFTER + LINE_HEIGHT * 3);
  y -= SECTION_GAP_BEFORE;
  drawTextRun("10. 종합의견 (총평)", MARGIN_X, y - SECTION_TITLE_SIZE, bold, SECTION_TITLE_SIZE, pine);
  y -= SECTION_TITLE_SIZE + SECTION_GAP_AFTER;
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
      drawTextRun(l, MARGIN_X + CELL_PAD_X, ty, regular, FONT_SIZE + 0.5, ink);
      ty -= LINE_HEIGHT;
    }
    y = boxBottom;
  }

  return doc.save();
}
