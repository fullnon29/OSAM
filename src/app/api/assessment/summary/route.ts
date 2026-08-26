import { NextResponse } from "next/server";
import { requireSocialWorker } from "@/lib/require-social-worker";
import { generateDraftSummary, formatFullQA } from "@/lib/assessment-summary";
import { refineSummaryWithAI } from "@/lib/assessment-ai";
import {
  formatHouseSamples,
  formatRecipientHistory,
  getHouseSamples,
  getRecipientNarratives,
  getWorklogNotes,
} from "@/lib/narrative-corpus";
import { hasNotableKeyword } from "@/lib/documents/extract-worklog";

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

  // 센터 글투(모든 어르신 공통)와 이 어르신의 지난 서술·일지 기록을 함께 넘깁니다.
  const [houseSamples, history, worklogNotes] = await Promise.all([
    getHouseSamples(admin),
    recipientId ? getRecipientNarratives(admin, recipientId) : Promise.resolve([]),
    recipientId ? getWorklogNotes(admin, recipientId) : Promise.resolve([]),
  ]);

  const aiSummary = await refineSummaryWithAI({
    recipientName,
    draftSummary,
    fullQA,
    houseSamples: formatHouseSamples(houseSamples),
    recipientHistory: formatRecipientHistory(history),
  });

  const worklogRefs = worklogNotes.map((n) => {
    const ym = n.document_date ? n.document_date.slice(0, 7) : null;
    return {
      section: n.section,
      body: n.body,
      yearMonth: ym,
      notable: hasNotableKeyword(n.body),
    };
  });

  return NextResponse.json({
    draftSummary,
    aiSummary,
    referencedPastRecords: history.length,
    worklogRefs,
  });
}
