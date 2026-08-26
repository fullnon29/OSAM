"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AssessmentFormFields, { type Responses } from "./AssessmentFormFields";
import { checkCompliance, summarizeCompliance } from "@/lib/assessment-compliance";
import {
  clearDraft,
  draftKey,
  enqueueSave,
  flushQueue,
  loadDraft,
  readQueue,
  saveDraft,
} from "@/lib/offline-store";

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
  // 총평을 만들 때 이 어르신의 지난 기록을 몇 건 참고했는지 알려 줍니다.
  const [referencedPast, setReferencedPast] = useState(0);
  // 지금 판단근거를 작성 중인 항목
  const [assistingSection, setAssistingSection] = useState<string | null>(null);
  // 풀어쓰기 전에 적어 두셨던 메모. 되돌릴 수 있게 남겨 둡니다.
  const [notesBackup, setNotesBackup] = useState<Record<string, string>>({});
  const [worklogRefs, setWorklogRefs] = useState<
    { section: string; body: string; yearMonth: string | null; notable: boolean }[]
  >([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offlineNote, setOfflineNote] = useState<string | null>(null);
  const [restoredAt, setRestoredAt] = useState<string | null>(null);

  const storageKey = draftKey(recipientId, existing?.id ?? null);
  // 첫 렌더에서 불러온 값을 곧바로 다시 저장해 덮어쓰지 않도록 막습니다.
  const hydrated = useRef(false);

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
      // 이 어르신의 지난 서술을 함께 참고하도록 id 를 넘깁니다.
      body: JSON.stringify({ responses, recipientName, recipientId }),
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
    setReferencedPast(json.referencedPastRecords ?? 0);
    setWorklogRefs(json.worklogRefs ?? []);
  }

  /** 한 항목의 판단근거를 오샘 서술형식으로 채웁니다. */
  async function assistOpinion(sectionCode: string) {
    setAssistingSection(sectionCode);
    setError(null);
    try {
      const res = await fetch("/api/assessment/opinion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ responses, recipientName, recipientId, sectionCode }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "판단근거를 만들지 못했습니다.");
        return;
      }
      // 적어 두신 메모를 근거로 풀어쓴 것이므로 그 자리를 채웁니다.
      // 원래 메모는 따로 남겨 두어 언제든 되돌릴 수 있게 합니다.
      const code = `${sectionCode}_opinion`;
      const previous = typeof responses[code] === "string" ? (responses[code] as string).trim() : "";
      if (previous) setNotesBackup((prev) => ({ ...prev, [code]: previous }));
      onChange(code, json.opinion);
    } catch {
      setError("연결이 없어 판단근거를 만들지 못했습니다.");
    } finally {
      setAssistingSection(null);
    }
  }

  // 기기에 남아 있던 작성 중 내용을 되살립니다.
  // 통신이 끊기거나 앱이 꺼져도 현장에서 쓴 내용이 사라지지 않게 합니다.
  //
  // 기기 저장소는 서버 렌더링 시점에는 없으므로 화면이 뜬 뒤에 읽어야 하고,
  // 그래서 여기서 상태를 채웁니다(외부 저장소와 동기화하는 경우).
  useEffect(() => {
    const saved = loadDraft<{
      responses: Responses;
      assessedAt: string;
      draftSummary: string;
      aiSummary: string;
      finalSummary: string;
    }>(storageKey);
    if (saved) {
      /* eslint-disable react-hooks/set-state-in-effect -- 기기 저장소는 서버 렌더링 때 없어 화면이 뜬 뒤 읽어야 합니다 */
      setResponses(saved.value.responses ?? {});
      setAssessedAt(saved.value.assessedAt || assessedAt);
      setDraftSummary(saved.value.draftSummary ?? "");
      setAiSummary(saved.value.aiSummary ?? "");
      setFinalSummary(saved.value.finalSummary ?? "");
      setRestoredAt(saved.savedAt);
      /* eslint-enable react-hooks/set-state-in-effect */
    }
    hydrated.current = true;
    // 화면을 열 때 한 번만 복원합니다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 입력할 때마다 기기에 저장해 둡니다.
  useEffect(() => {
    if (!hydrated.current) return;
    saveDraft(storageKey, { responses, assessedAt, draftSummary, aiSummary, finalSummary });
  }, [storageKey, responses, assessedAt, draftSummary, aiSummary, finalSummary]);

  const trySendQueue = useCallback(async () => {
    if (readQueue().length === 0) return;
    const result = await flushQueue();
    if (result.sent > 0 && result.remaining === 0) {
      setOfflineNote(null);
      router.refresh();
    } else if (result.remaining > 0) {
      setOfflineNote(`전송하지 못한 기록 ${result.remaining}건이 기기에 저장돼 있습니다. 연결되면 자동으로 보냅니다.`);
    }
  }, [router]);

  // 연결이 돌아오면 밀린 저장을 자동으로 보냅니다.
  // 브라우저의 online 사건을 구독해 그때 상태를 갱신합니다.
  useEffect(() => {
    // 화면이 뜬 직후 한 번 시도하고, 이후에는 online 사건에 반응합니다.
    // 전송은 비동기라 상태 갱신도 이 렌더 이후에 일어납니다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void trySendQueue();
    window.addEventListener("online", trySendQueue);
    return () => window.removeEventListener("online", trySendQueue);
  }, [trySendQueue]);

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

    try {
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

      clearDraft(storageKey);
      router.push(`/assessment/recipients/${recipientId}`);
      router.refresh();
    } catch {
      // 연결이 없어 보내지 못한 것이므로, 잃지 않도록 기기에 넣어 둡니다.
      setSaving(false);
      enqueueSave({
        assessmentId: existing?.id ?? null,
        recipientId,
        recipientName,
        payload,
      });
      setOfflineNote(
        "연결되지 않아 기기에 저장했습니다. 신호가 잡히면 자동으로 전송되니 이 화면을 닫으셔도 됩니다."
      );
    }
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

      {offlineNote && <div className="offline-note">{offlineNote}</div>}

      {restoredAt && (
        <div className="offline-note subtle">
          작성 중이던 내용을 기기에서 되살렸습니다 ({new Date(restoredAt).toLocaleString("ko-KR")}).
        </div>
      )}

      <AssessmentFormFields
        responses={responses}
        onChange={onChange}
        onAssist={assistOpinion}
        assistingSection={assistingSection}
        notesBackup={notesBackup}
        onRestoreNotes={(code) => {
          const saved = notesBackup[code];
          if (saved === undefined) return;
          onChange(code, saved);
          setNotesBackup((prev) => {
            const next = { ...prev };
            delete next[code];
            return next;
          });
        }}
      />

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
          {generating ? "생성 중..." : "🪄 총평 생성 (오샘 서술형식)"}
        </button>

        {referencedPast > 0 && (
          <div className="offline-note subtle">
            이 어르신의 지난 기록 {referencedPast}건을 함께 참고했습니다.
          </div>
        )}

        {draftSummary && (
          <div className="summary-box">
            <h4>규칙기반 초안 (오샘 서술형식)</h4>
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

        {worklogRefs.length > 0 && (
          <div className="worklog-refs" style={{ marginTop: 20 }}>
            <h4 style={{ fontSize: 14, color: "var(--pine-deep)", marginBottom: 8 }}>
              업무수행일지 참조 ({worklogRefs.length}건)
            </h4>
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {worklogRefs.map((ref, i) => (
                <li
                  key={i}
                  style={{
                    padding: "6px 0",
                    borderBottom: "1px solid var(--border-light, #eee)",
                    color: ref.notable ? "#d32f2f" : "inherit",
                    fontWeight: ref.notable ? 600 : 400,
                    fontSize: 14,
                    lineHeight: 1.5,
                  }}
                >
                  <span style={{ fontWeight: 600, marginRight: 6 }}>
                    [{ref.yearMonth ?? "날짜 미상"}·{ref.section}]
                  </span>
                  {ref.body}
                </li>
              ))}
            </ul>
          </div>
        )}

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
