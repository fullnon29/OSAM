import { NextResponse } from "next/server";
import { requireSocialWorker } from "@/lib/require-social-worker";
import { generateDraftSummary, formatFullQA } from "@/lib/assessment-summary";
import { refineSummaryWithAI } from "@/lib/assessment-ai";

export const maxDuration = 60;

export async function POST(request: Request) {
  const result = await requireSocialWorker();
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const body = await request.json();
  const responses = body.responses ?? {};
  const recipientName = String(body.recipientName ?? "어르신");

  const draftSummary = generateDraftSummary(responses, recipientName);
  const fullQA = formatFullQA(responses);

  let aiSummary = draftSummary;
  try {
    aiSummary = await refineSummaryWithAI({ recipientName, draftSummary, fullQA });
  } catch (err) {
    console.error("AI 총평 보완 실패", err);
  }

  return NextResponse.json({ draftSummary, aiSummary });
}
