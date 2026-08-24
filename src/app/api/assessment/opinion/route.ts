import { NextResponse } from "next/server";
import { requireSocialWorker } from "@/lib/require-social-worker";
import { generateSectionDraft, formatSectionQA } from "@/lib/assessment-summary";
import { draftOpinionWithAI } from "@/lib/assessment-ai";
import { getSections } from "@/lib/assessment-form";
import {
  formatHouseSamples,
  formatRecipientHistory,
  getHouseSamples,
  getRecipientNarratives,
} from "@/lib/narrative-corpus";

export const maxDuration = 60;

/**
 * 항목 하나의 '의견 및 판단근거'를 우리 센터 글투로 써 줍니다.
 *
 * 규칙기반 초안을 먼저 만들고, 연결과 크레딧이 있으면 AI로 다듬습니다.
 * AI를 못 써도 초안은 늘 나오므로 형식이 비는 일은 없습니다.
 */
export async function POST(request: Request) {
  const result = await requireSocialWorker();
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  const { admin } = result;

  const body = await request.json();
  const responses = body.responses ?? {};
  const sectionCode = String(body.sectionCode ?? "");
  const recipientName = String(body.recipientName ?? "어르신");
  const recipientId = body.recipientId ? String(body.recipientId) : null;
  const formVersion = body.formVersion ?? null;

  const section = getSections(formVersion).find((s) => s.code === sectionCode);
  if (!section) {
    return NextResponse.json({ error: "알 수 없는 항목입니다." }, { status: 400 });
  }

  const draft = generateSectionDraft(responses, sectionCode, recipientName, formVersion);
  const sectionQA = formatSectionQA(responses, sectionCode, formVersion);

  const [houseSamples, history] = await Promise.all([
    getHouseSamples(admin),
    recipientId ? getRecipientNarratives(admin, recipientId) : Promise.resolve([]),
  ]);

  let opinion = draft;
  try {
    const refined = await draftOpinionWithAI({
      recipientName,
      sectionTitle: section.title,
      sectionQA,
      // 이미 적어 두신 내용이 있으면 그것을 실제 관찰 메모로 삼습니다.
      observationNotes:
        typeof responses[`${sectionCode}_opinion`] === "string"
          ? (responses[`${sectionCode}_opinion`] as string)
          : undefined,
      houseSamples: formatHouseSamples(houseSamples),
      recipientHistory: formatRecipientHistory(history),
    });
    if (refined) opinion = refined;
  } catch (err) {
    // 크레딧이 없거나 연결이 끊긴 경우. 규칙기반 초안을 그대로 씁니다.
    console.error("판단근거 AI 작성 실패", err);
  }

  return NextResponse.json({ opinion, draft, referencedPastRecords: history.length });
}
