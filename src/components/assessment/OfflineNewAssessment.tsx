"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AssessmentFormFields, { type Responses, type ResponseValue } from "./AssessmentFormFields";
import { checkCompliance, summarizeCompliance } from "@/lib/assessment-compliance";
import {
  clearDraft,
  enqueueSave,
  flushQueue,
  loadDraft,
  newLocalRecipientId,
  readQueue,
  saveDraft,
} from "@/lib/offline-store";

const DRAFT_KEY = "osam.draft.offline-new";

type RecipientForm = {
  name: string;
  birth_date: string;
  gender: string;
  ltc_grade: string;
  ltc_number: string;
  address: string;
  guardian_name: string;
  guardian_phone: string;
};

const EMPTY_RECIPIENT: RecipientForm = {
  name: "",
  birth_date: "",
  gender: "",
  ltc_grade: "",
  ltc_number: "",
  address: "",
  guardian_name: "",
  guardian_phone: "",
};

/** 되살릴 내용이 실제로 있는지 봅니다. 빈 서식을 되살렸다고 알리면 혼란스럽습니다. */
function hasContent(
  recipient: RecipientForm,
  responses: Responses,
  finalSummary: string
): boolean {
  if (Object.values(recipient).some((v) => v.trim() !== "")) return true;
  if (finalSummary.trim() !== "") return true;
  return Object.values(responses).some((v) =>
    Array.isArray(v) ? v.length > 0 : v !== undefined && v !== ""
  );
}

const TEXT_FIELDS: [keyof RecipientForm, string, string?][] = [
  ["name", "성함 (필수)"],
  ["birth_date", "생년월일", "date"],
  ["ltc_grade", "장기요양등급 (예: 3등급)"],
  ["ltc_number", "장기요양인정번호"],
  ["address", "주소"],
  ["guardian_name", "보호자 성함"],
  ["guardian_phone", "보호자 연락처", "tel"],
];

/**
 * 신호가 없는 곳에서 처음 뵙는 어르신의 욕구사정을 작성합니다.
 *
 * 기존 어르신과 달리 서버에서 불러올 내용이 없어, 이 화면은 연결 없이도
 * 처음부터 끝까지 쓸 수 있습니다. 저장하면 기기에 넣어 두었다가 신호가
 * 잡히면 어르신 등록과 욕구사정을 순서대로 자동 전송합니다.
 */
export default function OfflineNewAssessment() {
  const [recipient, setRecipient] = useState<RecipientForm>(EMPTY_RECIPIENT);
  const [responses, setResponses] = useState<Responses>({});
  const [assessedAt, setAssessedAt] = useState("");
  const [finalSummary, setFinalSummary] = useState("");
  const [savedNote, setSavedNote] = useState<string | null>(null);
  const [restoredAt, setRestoredAt] = useState<string | null>(null);
  const [pending, setPending] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const hydrated = useRef(false);

  const complianceIssues = useMemo(
    () => checkCompliance({ responses, finalSummary, assessedAt }),
    [responses, finalSummary, assessedAt]
  );
  const compliance = summarizeCompliance(complianceIssues);

  // 기기에 남아 있던 작성 중 내용을 되살립니다.
  // 정적으로 만든 화면이라 서버 렌더링 때는 저장소가 없어, 화면이 뜬 뒤에 읽습니다.
  useEffect(() => {
    const saved = loadDraft<{
      recipient: RecipientForm;
      responses: Responses;
      assessedAt: string;
      finalSummary: string;
    }>(DRAFT_KEY);
    if (saved) {
      const r = saved.value.recipient ?? EMPTY_RECIPIENT;
      const resp = saved.value.responses ?? {};
      const summary = saved.value.finalSummary ?? "";
      /* eslint-disable react-hooks/set-state-in-effect */
      setRecipient(r);
      setResponses(resp);
      setFinalSummary(summary);
      if (hasContent(r, resp, summary)) setRestoredAt(saved.savedAt);
      /* eslint-enable react-hooks/set-state-in-effect */
    }
    setAssessedAt(saved?.value.assessedAt || new Date().toISOString().slice(0, 10));
    hydrated.current = true;
  }, []);

  useEffect(() => {
    if (!hydrated.current) return;
    // 저장을 마쳐 서식이 빈 상태면 남겨 둘 이유가 없습니다.
    if (!hasContent(recipient, responses, finalSummary)) {
      clearDraft(DRAFT_KEY);
      return;
    }
    saveDraft(DRAFT_KEY, { recipient, responses, assessedAt, finalSummary });
  }, [recipient, responses, assessedAt, finalSummary]);

  const trySend = useCallback(async () => {
    if (readQueue().length === 0) {
      setPending(0);
      return;
    }
    const result = await flushQueue();
    setPending(result.remaining);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPending(readQueue().length);
    void trySend();
    window.addEventListener("online", trySend);
    return () => window.removeEventListener("online", trySend);
  }, [trySend]);

  function onChange(code: string, value: ResponseValue) {
    setResponses((prev) => ({ ...prev, [code]: value }));
  }

  function save() {
    const name = recipient.name.trim();
    if (!name) {
      setError("어르신 성함을 입력해 주세요.");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setError(null);

    // 서버가 아직 id를 주지 않았으므로 기기에서 임시 id를 만들어 둘을 이어 둡니다.
    const localId = newLocalRecipientId();

    enqueueSave({
      kind: "recipient",
      assessmentId: null,
      recipientId: localId,
      recipientName: name,
      payload: { ...recipient, name },
    });

    enqueueSave({
      kind: "assessment",
      assessmentId: null,
      recipientId: localId,
      recipientName: name,
      payload: {
        care_recipient_id: localId,
        assessed_at: assessedAt,
        responses,
        final_summary: finalSummary || null,
        status: "completed",
      },
    });

    clearDraft(DRAFT_KEY);
    setRecipient(EMPTY_RECIPIENT);
    setResponses({});
    setFinalSummary("");
    setRestoredAt(null);
    setSavedNote(
      name + " 어르신의 욕구사정을 기기에 저장했습니다. 신호가 잡히면 자동으로 전송됩니다."
    );
    window.scrollTo({ top: 0, behavior: "smooth" });
    void trySend();
  }

  return (
    <div className="app-wrap" style={{ maxWidth: 860 }}>
      <a
        className="btn outline small"
        href="/assessment"
        style={{ display: "inline-flex", marginBottom: 16, width: "auto" }}
      >
        ← 수급자 목록으로
      </a>

      <div className="page-head">
        <div>
          <h1>신규 어르신 욕구사정</h1>
          <p>
            신호가 없는 곳에서도 처음부터 작성할 수 있습니다. 저장하면 기기에 보관했다가 신호가
            잡히면 어르신 등록과 욕구사정이 순서대로 자동 전송됩니다.
          </p>
        </div>
      </div>

      {error && <div className="form-error">{error}</div>}
      {savedNote && <div className="offline-note">{savedNote}</div>}
      {pending > 0 && (
        <div className="offline-note">
          전송 대기 중인 기록 {pending}건이 기기에 있습니다. 연결되면 자동으로 보냅니다.
        </div>
      )}
      {restoredAt && (
        <div className="offline-note subtle">
          작성 중이던 내용을 기기에서 되살렸습니다 ({new Date(restoredAt).toLocaleString("ko-KR")}).
        </div>
      )}

      <div className="detail-card assess-section">
        <h2 style={{ fontSize: 18, color: "var(--pine-deep)", marginBottom: 14 }}>어르신 정보</h2>
        {TEXT_FIELDS.map(([key, label, type]) => (
          <div className="assess-field" key={key}>
            <label>{label}</label>
            <input
              type={type ?? "text"}
              value={recipient[key]}
              onChange={(e) => setRecipient((r) => ({ ...r, [key]: e.target.value }))}
            />
          </div>
        ))}
        <div className="assess-field">
          <label>성별</label>
          <div className="assess-pill-group">
            {[
              ["M", "남"],
              ["F", "여"],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={`assess-pill ${recipient.gender === value ? "active" : ""}`}
                onClick={() =>
                  setRecipient((r) => ({ ...r, gender: r.gender === value ? "" : value }))
                }
              >
                {label}
              </button>
            ))}
          </div>
        </div>
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

      <AssessmentFormFields responses={responses} onChange={onChange} />

      <div className="detail-card assess-section">
        <h2 style={{ fontSize: 18, color: "var(--pine-deep)", marginBottom: 14 }}>
          종합의견 (총평)
        </h2>
        <p className="assess-section-note">
          총평을 인공지능으로 다듬는 기능은 연결이 필요합니다. 여기서는 직접 작성해 두시고,
          사무실에서 이어서 손보셔도 됩니다.
        </p>
        <div className="assess-field">
          <label>총평</label>
          <textarea
            value={finalSummary}
            onChange={(e) => setFinalSummary(e.target.value)}
            style={{ minHeight: 160 }}
            placeholder="어르신의 상태와 필요한 지원을 서술형으로 작성하세요."
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
          {!compliance.passed && (
            <ul className="compliance-list">
              {complianceIssues.map((issue, i) => (
                <li key={i} className={issue.severity}>
                  <span className="compliance-item">{issue.item}</span>
                  {issue.message}
                </li>
              ))}
            </ul>
          )}
        </div>

        <button
          className="btn small"
          type="button"
          style={{ marginTop: 16, width: "100%" }}
          onClick={save}
        >
          기기에 저장 (연결되면 자동 전송)
        </button>
      </div>
    </div>
  );
}
