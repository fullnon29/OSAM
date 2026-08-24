import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { HOUSE_STYLE_GUIDE } from "./narrative-style";

// 규칙기반 초안을 우리 센터 글투로 다듬습니다.
//
// 글투 지침과 예문은 어느 어르신이든 똑같이 앞에 붙습니다. 그래야
// 모든 기록이 같은 형식으로 나오고, 앞부분이 매번 같아 요청 비용도 아낍니다.
// 그 어르신 본인의 지난 서술은 뒤에 붙여, 과거와 어긋나지 않게 합니다.

const MODEL = "claude-sonnet-4-5";

function buildSystemPrompt(houseSamples: string): string {
  const base =
    "당신은 재가 장기요양기관 '오샘재가복지센터'의 사회복지사를 돕는 보조 도구입니다.\n" +
    "주어진 근거만으로 욕구사정 서술을 작성합니다. 문답에 없는 사실을 추측하거나 지어내지 마십시오.\n" +
    "진단을 내리거나 과장하지 말고, 관찰된 사실과 필요한 지원을 중심으로 적으십시오.\n\n" +
    HOUSE_STYLE_GUIDE;
  return houseSamples ? `${base}\n\n${houseSamples}` : base;
}

/** Anthropic 호출부. 글투 지침은 캐시해 두고 재사용합니다. */
async function ask(params: {
  system: string;
  user: string;
  maxTokens: number;
}): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY 가 없습니다.");

  const client = new Anthropic({ apiKey });
  const message = await client.messages.create({
    model: MODEL,
    max_tokens: params.maxTokens,
    system: [
      {
        type: "text",
        text: params.system,
        // 어느 어르신이든 앞부분이 같으므로 캐시가 걸립니다.
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: params.user }],
  });

  return message.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
}

/**
 * 총평을 우리 글투로 다듬습니다.
 *
 * 실패하면 규칙기반 초안을 그대로 돌려줍니다. 초안도 이미 우리 글투라
 * AI를 못 쓰는 상황에서도 형식은 지켜집니다.
 */
export async function refineSummaryWithAI(params: {
  recipientName: string;
  draftSummary: string;
  fullQA: string;
  /** 센터 글투 예문 (모든 어르신 공통) */
  houseSamples?: string;
  /** 이 어르신의 지난 서술 */
  recipientHistory?: string;
}): Promise<string> {
  try {
    const user = [
      `수급자 성명: ${params.recipientName}`,
      "",
      "[규칙기반 초안]",
      params.draftSummary,
      "",
      "[이번 회차 전체 문답]",
      params.fullQA,
      params.recipientHistory ? `\n[이 어르신의 지난 기록]\n${params.recipientHistory}` : "",
      "",
      "위 근거만으로 종합의견(총평)을 작성하십시오.",
      "결과는 총평 본문만 출력하고 제목이나 설명은 붙이지 마십시오.",
    ].join("\n");

    const text = await ask({
      system: buildSystemPrompt(params.houseSamples ?? ""),
      user,
      maxTokens: 1500,
    });
    return text || params.draftSummary;
  } catch (err) {
    console.error("AI 총평 보완 실패", err);
    return params.draftSummary;
  }
}

/**
 * 항목별 '의견 및 판단근거'를 우리 글투로 써 줍니다.
 *
 * 공단 평가에서 체크만 한 기록은 인정받지 못하므로, 항목마다 판단근거가
 * 필요합니다. 총평과 같은 글투를 쓰되 그 항목 이야기만 적습니다.
 */
export async function draftOpinionWithAI(params: {
  recipientName: string;
  sectionTitle: string;
  sectionQA: string;
  houseSamples?: string;
  recipientHistory?: string;
  /**
   * 사회복지사가 방문 때 직접 적어 둔 관찰 메모.
   *
   * 판단근거가 인정받으려면 어르신의 현재 상태를 구체적으로 적어야 하는데,
   * 그 구체적인 내용은 실제로 보신 것이어야 합니다. 메모를 주시면 AI가
   * 지어내는 대신 그 내용을 풀어 씁니다.
   */
  observationNotes?: string;
}): Promise<string> {
  const notes = params.observationNotes?.trim();

  const user = [
    `수급자 성명: ${params.recipientName}`,
    `작성할 항목: ${params.sectionTitle}`,
    "",
    "[이 항목의 문답]",
    params.sectionQA,
    notes
      ? `\n[사회복지사가 방문 때 직접 적은 관찰 메모]\n${notes}\n` +
        "이 메모는 실제로 보고 들은 내용입니다. 빠뜨리지 말고 모두 살려서, " +
        "짧게 적힌 것을 온전한 문장으로 풀어 쓰십시오. 여기 적힌 구체적인 내용" +
        "(동작·부위·사물·장소 등)은 그대로 쓰셔도 됩니다."
      : "",
    params.recipientHistory ? `\n[이 어르신의 지난 기록]\n${params.recipientHistory}` : "",
    "",
    `'${params.sectionTitle}' 항목의 '의견 및 판단근거'를 3~5문장으로 작성하십시오.`,
    "무엇을 보고 판단했는지 먼저 밝히고, 어르신의 현재 상태를 구체적으로 적은 다음,",
    "필요한 지원으로 맺으십시오.",
    "이 항목과 관계없는 내용은 적지 마십시오. 본문만 출력하십시오.",
  ].join("\n");

  return ask({
    system: buildSystemPrompt(params.houseSamples ?? ""),
    user,
    maxTokens: 600,
  });
}
