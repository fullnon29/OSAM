"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AssessmentFormFields, { type Responses } from "./AssessmentFormFields";
import { checkCompliance, summarizeCompliance } from "@/lib/assessment-compliance";

export type ExistingAssessment = {
  id: string;
  round_no: number;
  assessed_at: string;
  responses: Responses;
  draft_summary: string | null;
  ai_summary: string | null;
  final_summary: string | null;
  status: string;
};

export default function AssessmentEditor({
  recipientId,
  recipientName,
  existing,
  initialResponses,
  previousRoundNo,
  priorDocument,
}: {
  recipientId: string;
  recipientName: string;
  existing?: ExistingAssessment;
  /** when starting a new round, pre-fill from the previous round's answers */
  initialResponses?: Responses;
  previousRoundNo?: number;
  /** 이 시스템의 기록이 없어 과거 보관 서류에서 불러온 경우의 출처 */
  priorDocument?: { filename: string; date: string | null };
}) {
  const router = useRouter();
  const [responses, setResponses] = useState<Responses>(
    existing?.responses ?? initialResponses ?? {}
  );
  const [assessedAt, setAssessedAt] = useState(
    existing?.assessed_at ?? new Date().toISOString().slice(0, 10)
  );
  const [draftSummary, setDraftSummary] = useState(existing?.draft_summary ?? "");
  const [aiSummary, setAiSummary] = useState(existing?.ai_summary ?? "");
  const [finalSummary, setFinalSummary] = useState(existing?.final_summary ?? "");
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function onChange(code: string, value: Responses[string]) {
    setResponses((prev) => ({ ...prev, [code]: value }));
  }

  // 공단 평가 지표 충족 여부. 체크만 채운 기록은 인정되지 않으므로
  // 완료 처리 전에 빠진 판단근거를 짚어 줍니다.
  const complianceIssues = useMemo(
    () => checkCompliance({ responses, finalSummary, assessedAt }),
    [responses, finalSummary, assessedAt]
  );
  const compliance = summarizeCompliance(complianceIssues);

  async function generateSummary() {
    setGenerating(true);
    setError(null);
    const res = await fetch("/api/assessment/summary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ responses, recipientName }),
    });
    const json = await res.json();
    setGenerating(false);
    if (!res.ok) {
      setError(json.error || "총평 생성 중 오류가 발생했습니다.");
      return;
    }
    setDraftSummary(json.draftSummary);
    setAiSummary(json.aiSummary);
    setFinalSummary(json.aiSummary);
  }

  async function save(status: "draft" | "completed") {
    setSaving(true);
    setError(null);

    const payload = {
      care_recipient_id: recipientId,
      assessed_at: assessedAt,
      responses,
      draft_summary: draftSummary || null,
      ai_summary: aiSummary || null,
      final_summary: finalSummary || null,
      status,
    };

    const res = existing
      ? await fetch(`/api/assessment/assessments/${existing.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
      : await fetch("/api/assessment/assessments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

    const json = await res.json();
    setSaving(false);

    if (!res.ok) {
      setError(json.error || "저장 중 오류가 발생했습니다.");
      return;
    }

    router.push(`/assessment/recipients/${recipientId}`);
    router.refresh();
  }

  return (
    <div className="app-wrap" style={{ maxWidth: 860 }}>
      <Link
        className="btn outline small"
        href={`/assessment/recipients/${recipientId}`}
        style={{ display: "inline-flex", marginBottom: 16, width: "auto" }}
      >
        ← 수급자 상세로
      </Link>

      <div className="page-head">
        <div>
          <h1>
            {recipientName} 어르신 욕구조사기록지
            {existing ? ` · ${existing.round_no}회차` : " · 신규 작성"}
          </h1>
          <p>영역별 문항에 응답한 뒤 &quot;총평 생성&quot;을 눌러 초안을 만들고, 검토·수정 후 저장하세요.</p>
        </div>
      </div>

      {!existing && initialResponses && previousRoundNo !== undefined && (
        <div className="detail-card assess-section" style={{ background: "var(--paper-deep)" }}>
          <strong>{previousRoundNo}회차 응답을 불러왔습니다.</strong> 변경된 부분만 수정한 뒤,
          &quot;총평 생성&quot;을 눌러 이번 회차 상태에 맞는 총평을 새로 만드세요.
        </div>
      )}

      {!existing && priorDocument && (
        <div className="detail-card assess-section prior-doc-note">
          <strong>과거 서류에서 불러온 내용입니다.</strong>{" "}
          <span className="prior-doc-source">
            {priorDocument.filename}
            {priorDocument.date ? ` · ${priorDocument.date}` : ""}
          </span>
          <p>
            원본을 자동으로 읽어 채운 <strong>추정값</strong>이라 빠지거나 틀린 항목이 있을 수
            있습니다. 어르신의 현재 상태와 대조해 확인·수정한 뒤 저장해 주세요.
          </p>
        </div>
      )}

      <div className="detail-card assess-section">
        <div className="assess-field">
          <label>작성(방문사정)일</label>
          <input
            type="date"
            value={assessedAt}
            onChange={(e) => setAssessedAt(e.target.value)}
            style={{ maxWidth: 220 }}
          />
        </div>
      </div>

      {error && <div className="form-error">{error}</div>}

      <AssessmentFormFields responses={responses} onChange={onChange} />

      <div className="detail-card assess-section">
        <h2 style={{ fontSize: 18, color: "var(--pine-deep)", marginBottom: 14 }}>
          10. 종합의견 (총평)
        </h2>
        <button
          className="btn"
          type="button"
          onClick={generateSummary}
          disabled={generating}
          style={{ width: "auto", padding: "12px 22px", marginBottom: 18 }}
        >
          {generating ? "생성 중..." : "🪄 총평 생성 (규칙기반 + AI 보완)"}
        </button>

        {draftSummary && (
          <div className="summary-box">
            <h4>규칙기반 초안</h4>
            <p>{draftSummary}</p>
          </div>
        )}
        {aiSummary && (
          <div className="summary-box">
            <h4>AI 보완본</h4>
            <p>{aiSummary}</p>
          </div>
        )}

        <div className="assess-field">
          <label>최종 총평 (직접 검토·수정 후 저장하세요)</label>
          <textarea
            value={finalSummary}
            onChange={(e) => setFinalSummary(e.target.value)}
            style={{ minHeight: 160 }}
            placeholder="총평 생성 버튼을 누르면 초안이 채워집니다. 자유롭게 수정하세요."
          />
        </div>

        <div className="compliance-box" style={{ marginTop: 20 }}>
          <h4>
            공단 평가기준 점검
            {compliance.passed ? (
              <span className="compliance-ok">충족</span>
            ) : (
              <span className="compliance-bad">
                미충족 {compliance.blocking}건
                {compliance.warnings > 0 ? ` · 확인 ${compliance.warnings}건` : ""}
              </span>
            )}
          </h4>
          {compliance.passed ? (
            <p className="compliance-note">
              세부내용 8개 항목의 판단근거와 총평이 모두 작성되었습니다.
            </p>
          ) : (
            <>
              <p className="compliance-note">
                평가매뉴얼상 <strong>체크만 하고 판단근거가 없으면 인정되지 않습니다.</strong>{" "}
                아래 항목을 채운 뒤 완료 처리하세요.
              </p>
              <ul className="compliance-list">
                {complianceIssues.map((issue, i) => (
                  <li key={i} className={issue.severity}>
                    <span className="compliance-item">{issue.item}</span>
                    {issue.message}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        <div className="modal-actions" style={{ marginTop: 16 }}>
          <button
            className="btn outline small"
            type="button"
            style={{ flex: 1, width: "auto" }}
            onClick={() => save("draft")}
            disabled={saving}
          >
            {saving ? "저장 중..." : "임시저장"}
          </button>
          <button
            className="btn small"
            type="button"
            style={{ flex: 1, width: "auto" }}
            onClick={() => save("completed")}
            disabled={saving}
          >
            {saving ? "저장 중..." : "완료로 저장"}
          </button>
        </div>
      </div>
    </div>
  );
}
