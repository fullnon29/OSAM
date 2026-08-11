import "server-only";
import { ASSESSMENT_SECTIONS } from "./assessment-form";

export type AssessmentResponses = Record<string, string | string[] | number | undefined>;

const SECTION_LABEL: Record<string, string> = {
  s1: "조사 개요",
  s2: "건강상태",
  s3: "일상생활기능",
  s4: "재활 및 신체기능",
  s5: "간호관리",
  s6: "인지 및 의사소통",
  s7: "가족 및 지지체계",
  s8: "주거환경",
  s9: "희망 서비스",
};

const NEUTRAL_VALUES = new Set([
  "없음",
  "양호",
  "정상",
  "해당없음",
  "0 · 혼자 할 수 있음",
]);

function isMeaningful(value: string) {
  return Boolean(value) && !NEUTRAL_VALUES.has(value);
}

// 1단계: 응답값을 표준 문구로 조합한 규칙기반 초안 총평
export function generateDraftSummary(
  responses: AssessmentResponses,
  recipientName: string
): string {
  const paragraphs: string[] = [];

  for (const section of ASSESSMENT_SECTIONS) {
    const findings: string[] = [];
    let opinion = "";

    for (const field of section.fields) {
      const value = responses[field.code];

      if (field.code.endsWith("_opinion")) {
        if (typeof value === "string" && value.trim()) opinion = value.trim();
        continue;
      }

      if (field.type === "multiselect" && Array.isArray(value)) {
        const meaningful = value.filter((v) => isMeaningful(v));
        if (meaningful.length) findings.push(`${field.label}(${meaningful.join(", ")})`);
      } else if (
        (field.type === "select" || field.type === "scale4") &&
        typeof value === "string" &&
        isMeaningful(value)
      ) {
        findings.push(`${field.label}(${value})`);
      }
    }

    if (!findings.length && !opinion) continue;

    const label = SECTION_LABEL[section.code] ?? section.title;
    let text = findings.length ? `[${label}] ${findings.join(", ")}.` : `[${label}]`;
    if (opinion) text += ` ${opinion}`;
    paragraphs.push(text);
  }

  if (!paragraphs.length) {
    return `${recipientName} 어르신에 대한 욕구조사 응답이 아직 부족하여 초안을 생성할 수 없습니다.`;
  }

  return paragraphs.join("\n\n");
}

// AI 보완 단계에 함께 전달할, 전체 문답을 사람이 읽기 좋은 텍스트로 정리
export function formatFullQA(responses: AssessmentResponses): string {
  const lines: string[] = [];
  for (const section of ASSESSMENT_SECTIONS) {
    const sectionLines: string[] = [];
    for (const field of section.fields) {
      const value = responses[field.code];
      if (value === undefined || value === null || value === "") continue;
      const text = Array.isArray(value) ? value.join(", ") : String(value);
      sectionLines.push(`- ${field.label}: ${text}`);
    }
    if (sectionLines.length) {
      lines.push(`## ${section.title}\n${sectionLines.join("\n")}`);
    }
  }
  return lines.join("\n\n");
}
