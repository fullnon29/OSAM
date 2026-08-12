import "server-only";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
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

export async function generateAssessmentDocx(params: {
  recipientName: string;
  roundNo: number;
  assessedAt: string;
  authorName: string;
  responses: Responses;
  finalSummary: string;
}): Promise<Buffer> {
  const { recipientName, roundNo, assessedAt, authorName, responses, finalSummary } = params;

  const children: Paragraph[] = [
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
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 300, after: 100 },
      })
    );
    if (section.note) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: section.note, italics: true, size: 18, color: "666666" }),
          ],
          spacing: { after: 120 },
        })
      );
    }

    let lastGroup: string | undefined;
    for (const field of section.fields) {
      if (field.group && field.group !== lastGroup) {
        lastGroup = field.group;
        children.push(
          new Paragraph({
            children: [new TextRun({ text: field.group, bold: true, size: 21 })],
            spacing: { before: 160, after: 60 },
          })
        );
      }
      children.push(
        new Paragraph({
          spacing: { after: 60 },
          children: [
            new TextRun({ text: `${field.label}: `, bold: true }),
            new TextRun(fieldValueText(field, responses)),
          ],
        })
      );
    }
  }

  children.push(
    new Paragraph({
      text: "10. 종합의견 (총평)",
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 300, after: 120 },
    }),
    new Paragraph({
      children: [new TextRun(finalSummary || "-")],
    })
  );

  const doc = new Document({
    sections: [{ children }],
  });

  return Packer.toBuffer(doc);
}
