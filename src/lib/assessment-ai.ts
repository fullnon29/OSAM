import "server-only";
import Anthropic from "@anthropic-ai/sdk";

// 2단계: 규칙기반 초안 + 전체 문답을 Claude에 보내 자연스러운 최종 총평으로 보완
export async function refineSummaryWithAI(params: {
  recipientName: string;
  draftSummary: string;
  fullQA: string;
}): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    // 키가 없으면 규칙기반 초안을 그대로 반환 (AI 보완은 건너뜀)
    return params.draftSummary;
  }

  const client = new Anthropic({ apiKey });

  const message = await client.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 1200,
    system:
      "당신은 재가 장기요양기관의 사회복지사를 돕는 보조 도구입니다. " +
      "주어진 '규칙기반 초안'과 '전체 문답 내용'만을 근거로, 자연스럽고 전문적인 한국어 종합의견(총평) 문단을 작성하세요. " +
      "문답에 없는 사실을 추측하거나 새로 지어내지 마세요. 존재하지 않는 정보는 언급하지 마세요. " +
      "어색한 나열식 문장을 자연스러운 서술형 문단으로 다듬되, 원래 있던 사실 관계는 바꾸지 마세요. " +
      "과장하거나 진단을 내리지 말고, 관찰된 사실과 필요 지원 중심으로 서술하세요. " +
      "결과는 총평 본문 텍스트만 출력하고, 제목이나 부가 설명은 붙이지 마세요.",
    messages: [
      {
        role: "user",
        content:
          `수급자 성명: ${params.recipientName}\n\n` +
          `[규칙기반 초안]\n${params.draftSummary}\n\n` +
          `[전체 문답 내용]\n${params.fullQA}\n\n` +
          "위 내용을 바탕으로 다듬어진 최종 종합의견(총평)을 작성해 주세요.",
      },
    ],
  });

  const text = message.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();

  return text || params.draftSummary;
}
