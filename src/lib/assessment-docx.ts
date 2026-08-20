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

type Responses = Record<string, string | string[] | number | undefined>;

function renderChoiceLine(field: Field, value: string | string[] | number | undefined): string {
  const selected = Array.isArray(value) ? value : value !== undefined ? [String(value)] : [];
  return (field.options ?? [])
    .map((opt) => `${selected.includes(opt) ? "☑" : "☐"} ${opt}`)
    .join("   ");
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
  recipientName: string;
  roundNo: number;
  assessedAt: string;
  authorName: string;
  responses: Responses;
  finalSummary: string;
}): Promise<Buffer> {
  const { recipientName, roundNo, assessedAt, authorName, responses, finalSummary } = params;

  const children: Array<Paragraph | Table> = [
    new Paragraph({
      text: "욕구조사기록지",
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 300 },
      children: [
        new TextRun(
          `수급자: ${recipientName}   |   ${roundNo}회차   |   작성(방문사정)일: ${assessedAt}   |   작성자: ${authorName}`
        ),
      ],
    }),
  ];

  for (const section of ASSESSMENT_SECTIONS) {
    children.push(
      new Paragraph({
        text: section.title,
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 260, after: 80 },
      })
    );
    if (section.note) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: section.note, italics: true, size: 16, color: "666666" }),
          ],
          spacing: { after: 100 },
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
    new Paragraph({
      text: "10. 종합의견 (총평)",
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 260, after: 80 },
    }),
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
