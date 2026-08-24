import { NextResponse } from "next/server";
import { requireSocialWorker } from "@/lib/require-social-worker";
import { generateDraftSummary, formatFullQA } from "@/lib/assessment-summary";
import { refineSummaryWithAI } from "@/lib/assessment-ai";
import {
  formatHouseSamples,
  formatRecipientHistory,
  getHouseSamples,
  getRecipientNarratives,
} from "@/lib/narrative-corpus";

export const maxDuration = 60;

export async function POST(request: Request) {
  const result = await requireSocialWorker();
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  const { admin } = result;

  const body = await request.json();
  const responses = body.responses ?? {};
  const recipientName = String(body.recipientName ?? "어르신");
  const recipientId = body.recipientId ? String(body.recipientId) : null;
  const formVersion = body.formVersion ?? null;

  const draftSummary = generateDraftSummary(responses, recipientName, formVersion);
  const fullQA = formatFullQA(responses, formVersion);

  // 센터 글투(모든 어르신 공통)와 이 어르신의 지난 서술을 함께 넘깁니다.
  const [houseSamples, history] = await Promise.all([
    getHouseSamples(admin),
    recipientId ? getRecipientNarratives(admin, recipientId) : Promise.resolve([]),
  ]);

  const aiSummary = await refineSummaryWithAI({
    recipientName,
    draftSummary,
    fullQA,
    houseSamples: formatHouseSamples(houseSamples),
    recipientHistory: formatRecipientHistory(history),
  });

  return NextResponse.json({
    draftSummary,
    aiSummary,
    // 화면에서 "지난 기록 N건을 참고했습니다"라고 알려 주기 위함입니다.
    referencedPastRecords: history.length,
  });
}
