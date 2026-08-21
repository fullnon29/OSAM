// 과거 욕구사정 서류의 본문을 읽어 문항별 응답으로 옮깁니다 (요구사항 2).
//
// 서식이 연도마다 달라 위치로는 읽을 수 없어 AI에 맡기되, 돌아온 값은 그대로
// 믿지 않고 현재 서식에 실재하는 문항·선택지인지 전부 대조해 걸러냅니다.
// 지어낸 문항이나 없는 선택지는 버려서, 원본에 없는 내용이 기록에 스며들지
// 않게 합니다.
//
// 웹과 로컬 프로그램이 함께 쓰는 공용 모듈이라 server-only 가드를 두지 않습니다.

import Anthropic from "@anthropic-ai/sdk";
import { getSections, CURRENT_FORM_VERSION } from "../forms";
import type { Field } from "../forms/types";

export type ExtractedResponses = Record<string, string | string[] | number>;

export type ExtractionResult = {
  responses: ExtractedResponses;
  documentDate: string | null;
  /** 원본에 없어 비워 둔 문항 수 - 얼마나 채워졌는지 가늠하는 데 씁니다 */
  filled: number;
  total: number;
};

const MODEL = "claude-sonnet-4-5";

function describeField(field: Field): string {
  const base = `- ${field.code} (${field.label})`;
  if (field.type === "multiselect") {
    return `${base} [여러 개 선택 가능] 선택지: ${(field.options ?? []).join(" | ")}`;
  }
  if (field.type === "select" || field.type === "scale4") {
    return `${base} [하나만 선택] 선택지: ${(field.options ?? []).join(" | ")}`;
  }
  if (field.type === "number") return `${base} [숫자${field.suffix ? `, 단위 ${field.suffix}` : ""}]`;
  return `${base} [자유 입력]`;
}

/** 서식 문항 목록. 문서마다 동일하므로 캐시해 두고 재사용합니다. */
export function buildFormSpec(formVersion = CURRENT_FORM_VERSION): string {
  const lines: string[] = [];
  for (const section of getSections(formVersion)) {
    lines.push(`\n## ${section.title}`);
    for (const field of section.fields) lines.push(describeField(field));
  }
  return lines.join("\n");
}

const SYSTEM_PROMPT = `당신은 재가 장기요양기관의 기록을 정리하는 보조 도구입니다.
과거에 작성된 욕구사정 서류의 본문을 읽고, 아래 문항 목록에 해당하는 응답만 뽑아냅니다.

지켜야 할 규칙:
- 원본에 분명히 적혀 있는 내용만 옮깁니다. 추측하거나 지어내지 마세요.
- 서식이 해마다 달라 문항 이름이 조금씩 다를 수 있습니다. 뜻이 같으면 해당 문항으로 옮기세요.
- 원본에서 확인되지 않는 문항은 아예 넣지 마세요. 빈 값으로도 넣지 마세요.
- 선택지가 있는 문항은 반드시 주어진 선택지 문구 그대로 사용하세요.
- 체크 표시(■ ☑ √ V)가 된 항목만 선택된 것으로 봅니다. 빈 칸(□ ☐)은 선택되지 않은 것입니다.
- 의견·판단근거·총평 같은 서술형은 원문을 그대로 옮기고 요약하지 마세요.

결과는 다음 형태의 JSON만 출력하세요. 설명을 덧붙이지 마세요.
{"document_date": "YYYY-MM-DD 또는 null", "responses": {"문항코드": 값}}
여러 개 선택 가능한 문항의 값은 배열, 나머지는 문자열 또는 숫자입니다.`;

function parseJsonBlock(text: string): unknown {
  // 모델이 설명을 덧붙이거나 코드펜스를 씌우는 경우가 있어 JSON 부분만 떼어냅니다.
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = (fenced ? fenced[1] : text).trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("JSON 형식의 응답을 찾지 못했습니다.");
  return JSON.parse(candidate.slice(start, end + 1));
}

/**
 * 모델이 돌려준 값을 현재 서식과 대조해 걸러냅니다.
 * 실재하지 않는 문항, 선택지에 없는 값, 숫자가 아닌 숫자문항은 버립니다.
 */
export function validateResponses(
  raw: unknown,
  formVersion = CURRENT_FORM_VERSION
): ExtractedResponses {
  if (!raw || typeof raw !== "object") return {};
  const fields = new Map(getSections(formVersion).flatMap((s) => s.fields).map((f) => [f.code, f]));
  const out: ExtractedResponses = {};

  for (const [code, value] of Object.entries(raw as Record<string, unknown>)) {
    const field = fields.get(code);
    if (!field || value === null || value === undefined) continue;

    if (field.type === "multiselect") {
      const options = field.options ?? [];
      const picked = (Array.isArray(value) ? value : [value])
        .filter((v): v is string => typeof v === "string")
        .filter((v) => options.includes(v));
      if (picked.length) out[code] = picked;
      continue;
    }

    if (field.type === "select" || field.type === "scale4") {
      if (typeof value === "string" && (field.options ?? []).includes(value)) out[code] = value;
      continue;
    }

    if (field.type === "number") {
      const n = typeof value === "number" ? value : Number(value);
      if (Number.isFinite(n)) out[code] = n;
      continue;
    }

    if (typeof value === "string" && value.trim()) out[code] = value.trim();
  }

  return out;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function extractAssessmentFromText(params: {
  text: string;
  apiKey: string;
  formSpec: string;
  formVersion?: string;
}): Promise<ExtractionResult> {
  const { text, apiKey, formSpec, formVersion = CURRENT_FORM_VERSION } = params;
  const client = new Anthropic({ apiKey });

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 4000,
    system: [
      { type: "text", text: SYSTEM_PROMPT },
      // 문항 목록은 모든 문서에 대해 같으므로 캐시해 재사용합니다.
      // 수백 건을 처리할 때 입력 비용이 크게 줄어듭니다.
      { type: "text", text: `[문항 목록]\n${formSpec}`, cache_control: { type: "ephemeral" } },
    ],
    messages: [{ role: "user", content: `[욕구사정 서류 본문]\n${text}` }],
  });

  const body = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");

  const parsed = parseJsonBlock(body) as { document_date?: unknown; responses?: unknown };
  const responses = validateResponses(parsed.responses, formVersion);
  const documentDate =
    typeof parsed.document_date === "string" && DATE_RE.test(parsed.document_date)
      ? parsed.document_date
      : null;

  return {
    responses,
    documentDate,
    filled: Object.keys(responses).length,
    total: getSections(formVersion).flatMap((s) => s.fields).length,
  };
}
