import "server-only";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  ShadingType,
} from "docx";
import { ASSESSMENT_SECTIONS, type Field } from "./assessment-form";
import { recipientInfoPairs, type RecipientInfo } from "./assessment-recipient";

type Responses = Record<string, string | string[] | number | undefined>;

function selectedValues(value: string | string[] | number | undefined): string[] {
  return Array.isArray(value) ? value : value !== undefined ? [String(value)] : [];
}

function renderOptions(options: string[], selected: string[]): string {
  return options.map((opt) => `${selected.includes(opt) ? "☑" : "☐"} ${opt}`).join("   ");
}

function renderChoiceLine(field: Field, value: string | string[] | number | undefined): string {
  return renderOptions(field.options ?? [], selectedValues(value));
}

function fieldValueText(field: Field, responses: Responses): string {
  const value = responses[field.code];
  if (field.type === "select" || field.type === "scale4" || field.type === "multiselect") {
    return renderChoiceLine(field, value);
  }
  if ((typeof value === "string" && value.trim()) || typeof value === "number") {
    return field.suffix ? `${value} ${field.suffix}` : String(value);
  }
  return "-";
}

const LABEL_WIDTH_PCT = 28;
const VALUE_WIDTH_PCT = 72;
const BORDER = { style: BorderStyle.SINGLE, size: 4, color: "B0AEA6" };
const CELL_BORDERS = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };
const GROUP_SHADING = { type: ShadingType.CLEAR, color: "auto", fill: "F2EFE8" };

function cellParagraph(text: string, opts?: { bold?: boolean; color?: string }) {
  return new Paragraph({
    spacing: { before: 20, after: 20 },
    children: [
      new TextRun({ text, bold: opts?.bold, color: opts?.color, size: 17 }),
    ],
  });
}

function fieldRow(label: string, value: string) {
  return new TableRow({
    children: [
      new TableCell({
        width: { size: LABEL_WIDTH_PCT, type: WidthType.PERCENTAGE },
        borders: CELL_BORDERS,
        children: [cellParagraph(label, { bold: true })],
      }),
      new TableCell({
        width: { size: VALUE_WIDTH_PCT, type: WidthType.PERCENTAGE },
        borders: CELL_BORDERS,
        children: [cellParagraph(value)],
      }),
    ],
  });
}

// 원본 서식처럼 선택지를 계통별 줄로 나눠 그립니다.
// 첫 줄에만 문항명을 쓰고, 이후 줄은 계통명이 왼쪽 칸에 들어갑니다.
function groupedFieldRows(field: Field, value: string | string[] | number | undefined) {
  const selected = selectedValues(value);
  return (field.optionGroups ?? []).map((g, i) =>
    new TableRow({
      children: [
        new TableCell({
          width: { size: LABEL_WIDTH_PCT, type: WidthType.PERCENTAGE },
          borders: CELL_BORDERS,
          children: [
            cellParagraph(i === 0 ? field.label : `　${g.label}`, { bold: i === 0 }),
          ],
        }),
        new TableCell({
          width: { size: VALUE_WIDTH_PCT, type: WidthType.PERCENTAGE },
          borders: CELL_BORDERS,
          children: [cellParagraph(renderOptions(g.options, selected))],
        }),
      ],
    })
  );
}

// 절 제목 여백(twip). Word 기본 제목 스타일은 자체 여백을 갖고 있어 제목이 위 표에
// 달라붙고 아래로만 벌어지므로, 스타일 대신 직접 서식을 지정해 위쪽을 넓게 둡니다.
const SECTION_SPACE_BEFORE = 360;
const SECTION_SPACE_AFTER = 140;

function sectionHeading(title: string, opts?: { tightBelow?: boolean }) {
  return new Paragraph({
    spacing: {
      before: SECTION_SPACE_BEFORE,
      after: opts?.tightBelow ? 60 : SECTION_SPACE_AFTER,
    },
    keepNext: true, // 제목만 페이지 끝에 홀로 남지 않도록 다음 표와 붙여 둡니다.
    children: [new TextRun({ text: title, bold: true, size: 24, color: "1E3327" })],
  });
}

function groupRow(title: string) {
  return new TableRow({
    children: [
      new TableCell({
        width: { size: 100, type: WidthType.PERCENTAGE },
        columnSpan: 2,
        borders: CELL_BORDERS,
        shading: GROUP_SHADING,
        children: [cellParagraph(title, { bold: true, color: "1E3327" })],
      }),
    ],
  });
}

export async function generateAssessmentDocx(params: {
  recipient: RecipientInfo;
  roundNo: number;
  assessedAt: string;
  authorName: string;
  responses: Responses;
  finalSummary: string;
}): Promise<Buffer> {
  const { recipient, roundNo, assessedAt, authorName, responses, finalSummary } = params;

  const children: Array<Paragraph | Table> = [
    new Paragraph({
      text: "욕구조사기록지",
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [
        new TextRun(
          `${roundNo}회차   |   작성(방문사정)일: ${assessedAt}   |   작성자: ${authorName}`
        ),
      ],
    }),
    // 원본 서식 1. 일반사항의 수급자 인적사항 칸
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: {
        top: BORDER,
        bottom: BORDER,
        left: BORDER,
        right: BORDER,
        insideHorizontal: BORDER,
        insideVertical: BORDER,
      },
      rows: [
        groupRow("수급자"),
        ...recipientInfoPairs(recipient).map(([label, value]) => fieldRow(label, value)),
      ],
    }),
  ];

  for (const section of ASSESSMENT_SECTIONS) {
    children.push(sectionHeading(section.title, { tightBelow: Boolean(section.note) }));
    if (section.note) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: section.note, italics: true, size: 16, color: "666666" }),
          ],
          spacing: { after: SECTION_SPACE_AFTER },
        })
      );
    }

    const rows: TableRow[] = [];
    let lastGroup: string | undefined;
    for (const field of section.fields) {
      if (field.group && field.group !== lastGroup) {
        lastGroup = field.group;
        rows.push(groupRow(field.group));
      }
      if (field.optionGroups) {
        rows.push(...groupedFieldRows(field, responses[field.code]));
        continue;
      }
      const label = field.suffix ? `${field.label} (${field.suffix})` : field.label;
      rows.push(fieldRow(label, fieldValueText(field, responses)));
    }

    children.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: {
          top: BORDER,
          bottom: BORDER,
          left: BORDER,
          right: BORDER,
          insideHorizontal: BORDER,
          insideVertical: BORDER,
        },
        rows,
      })
    );
  }

  children.push(
    sectionHeading("10. 종합의견 (총평)"),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: {
        top: BORDER,
        bottom: BORDER,
        left: BORDER,
        right: BORDER,
        insideHorizontal: BORDER,
        insideVertical: BORDER,
      },
      rows: [
        new TableRow({
          children: [
            new TableCell({
              width: { size: 100, type: WidthType.PERCENTAGE },
              borders: CELL_BORDERS,
              children: (finalSummary || "-")
                .split("\n")
                .map((line) => cellParagraph(line)),
            }),
          ],
        }),
      ],
    })
  );

  const doc = new Document({
    sections: [{ children }],
  });

  return Packer.toBuffer(doc);
}
