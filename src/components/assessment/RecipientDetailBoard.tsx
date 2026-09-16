"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatKst } from "@/lib/format";
import type { Recipient } from "./RecipientsBoard";
import RecipientDocuments, { type CareDocument } from "./RecipientDocuments";
import RecipientRiskHistory, { type RiskRecord } from "./RecipientRiskHistory";

type FormState = {
  name: string;
  birth_date: string;
  gender: string;
  ltc_grade: string;
  ltc_number: string;
  address: string;
  guardian_name: string;
  guardian_phone: string;
  memo: string;
  is_active: boolean;
};

export type AssessmentSummary = {
  id: string;
  round_no: number;
  assessed_at: string;
  status: string;
  created_at: string;
};

export default function RecipientDetailBoard({
  recipient,
  assessments,
  documents,
  riskRecords,
}: {
  recipient: Recipient & {
    ltc_number: string | null;
    address: string | null;
    guardian_name: string | null;
    guardian_phone: string | null;
    memo: string | null;
  };
  assessments: AssessmentSummary[];
  documents: CareDocument[];
  riskRecords: RiskRecord[];
}) {
  const router = useRouter();
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openEditor() {
    setError(null);
    setForm({
      name: recipient.name,
      birth_date: recipient.birth_date ?? "",
      gender: recipient.gender ?? "",
      ltc_grade: recipient.ltc_grade ?? "",
      ltc_number: recipient.ltc_number ?? "",
      address: recipient.address ?? "",
      guardian_name: recipient.guardian_name ?? "",
      guardian_phone: recipient.guardian_phone ?? "",
      memo: recipient.memo ?? "",
      is_active: recipient.is_active,
    });
  }

  async function save() {
    if (!form) return;
    if (!form.name.trim()) {
      setError("성명은 비울 수 없습니다.");
      return;
    }
    setSaving(true);
    setError(null);

    const res = await fetch(`/api/assessment/recipients/${recipient.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const json = await res.json().catch(() => ({}));
    setSaving(false);

    if (!res.ok) {
      setError(json.error || "저장 중 오류가 발생했습니다.");
      return;
    }

    setForm(null);
    router.refresh();
  }

  return (
    <div className="app-wrap">
      <Link
        className="btn outline small"
        href="/assessment"
        style={{ display: "inline-flex", marginBottom: 16, width: "auto" }}
      >
        ← 수급자 목록으로
      </Link>

      <div className="page-head">
        <div>
          <h1>{recipient.name} 어르신</h1>
          <p>
            {recipient.birth_date ?? "생년월일 미상"} ·{" "}
            {recipient.gender === "M" ? "남" : recipient.gender === "F" ? "여" : "성별 미상"} ·{" "}
            {recipient.ltc_grade ?? "등급 미상"}
            {recipient.ltc_number ? ` · 인정번호 ${recipient.ltc_number}` : ""}
            {recipient.is_active ? "" : " · 종료"}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn outline small" type="button" style={{ width: "auto" }} onClick={openEditor}>
            정보 수정
          </button>
          <Link className="btn small" href={`/assessment/recipients/${recipient.id}/assessments/new`}>
            + 새 회차 작성
          </Link>
        </div>
      </div>

      <div className="detail-card" style={{ marginBottom: 24 }}>
        <div className="info-line">
          <div className="k">주소</div>
          <div>{recipient.address ?? "-"}</div>
        </div>
        <div className="info-line">
          <div className="k">보호자</div>
          <div>
            {recipient.guardian_name ?? "-"} {recipient.guardian_phone ? `(${recipient.guardian_phone})` : ""}
          </div>
        </div>
        <div className="info-line">
          <div className="k">비고</div>
          <div>{recipient.memo ?? "-"}</div>
        </div>
      </div>

      <h3 style={{ fontSize: 16, color: "var(--pine-deep)", marginBottom: 14 }}>
        욕구조사 이력
      </h3>
      {assessments.length === 0 && (
        <div className="empty-note">아직 작성된 욕구조사기록지가 없습니다.</div>
      )}
      {assessments.map((a) => (
        <div className="assess-round-card" key={a.id}>
          <Link
            href={`/assessment/recipients/${recipient.id}/assessments/${a.id}`}
            style={{ color: "inherit", textDecoration: "none" }}
          >
            <span className="round-no">{a.round_no}회차</span>
            <span style={{ marginLeft: 10, fontSize: 13, color: "var(--ink-soft)" }}>
              작성(방문사정)일 {a.assessed_at}
            </span>
          </Link>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {a.status === "completed" && (
              <>
                <a
                  className="btn outline small"
                  style={{ width: "auto", padding: "6px 12px", fontSize: 12.5 }}
                  href={`/api/assessment/assessments/${a.id}/docx`}
                >
                  워드 (.docx)
                </a>
                <a
                  className="btn outline small"
                  style={{ width: "auto", padding: "6px 12px", fontSize: 12.5 }}
                  href={`/api/assessment/assessments/${a.id}/pdf`}
                >
                  PDF
                </a>
                <a
                  className="btn outline small"
                  style={{ width: "auto", padding: "6px 12px", fontSize: 12.5 }}
                  href={`/api/assessment/assessments/${a.id}/hwp`}
                  title="일부 체크박스 항목만 자동으로 표시됩니다. 의견·총평 등 서술형 내용은 포함되지 않아, 전체 내용이 필요하면 워드나 PDF를 이용해 주세요."
                >
                  한글 (베타)
                </a>
              </>
            )}
            <span className={`status ${a.status === "completed" ? "done" : "todo"}`}>
              {a.status === "completed" ? "완료" : "작성중"}
            </span>
            <span style={{ fontSize: 12, color: "var(--ink-soft)" }}>{formatKst(a.created_at)}</span>
          </div>
        </div>
      ))}
      <div style={{ marginTop: 32 }}>
        <RecipientRiskHistory records={riskRecords} />
      </div>

      <div style={{ marginTop: 8 }}>
        <RecipientDocuments documents={documents} />
      </div>

      {form && (
        <div className="modal-bg active" onClick={() => setForm(null)}>
          <div
            className="cert edit-modal-box"
            style={{ maxWidth: 420 }}
            onClick={(e) => e.stopPropagation()}
          >
            <button className="close-x" type="button" onClick={() => setForm(null)}>
              ✕
            </button>
            <h2 style={{ fontSize: 18 }}>어르신 정보 수정</h2>
            {error && <div className="form-error">{error}</div>}

            <label>성명</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />

            <label>생년월일</label>
            <input
              type="date"
              value={form.birth_date}
              onChange={(e) => setForm({ ...form, birth_date: e.target.value })}
            />

            <label>성별</label>
            <select
              value={form.gender}
              onChange={(e) => setForm({ ...form, gender: e.target.value })}
            >
              <option value="">선택 안 함</option>
              <option value="M">남</option>
              <option value="F">여</option>
            </select>

            <label>장기요양등급</label>
            <input
              type="text"
              value={form.ltc_grade}
              onChange={(e) => setForm({ ...form, ltc_grade: e.target.value })}
              placeholder="예: 3등급"
            />

            <label>장기요양인정번호</label>
            <input
              type="text"
              value={form.ltc_number}
              onChange={(e) => setForm({ ...form, ltc_number: e.target.value })}
            />

            <label>주소</label>
            <input
              type="text"
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />

            <label>보호자 성명</label>
            <input
              type="text"
              value={form.guardian_name}
              onChange={(e) => setForm({ ...form, guardian_name: e.target.value })}
            />

            <label>보호자 연락처</label>
            <input
              type="text"
              value={form.guardian_phone}
              onChange={(e) => setForm({ ...form, guardian_phone: e.target.value })}
            />

            <label>비고</label>
            <textarea
              value={form.memo}
              onChange={(e) => setForm({ ...form, memo: e.target.value })}
            />

            <label>이용 상태</label>
            <select
              value={form.is_active ? "1" : "0"}
              onChange={(e) => setForm({ ...form, is_active: e.target.value === "1" })}
            >
              <option value="1">이용 중</option>
              <option value="0">종료</option>
            </select>

            <div className="modal-actions">
              <button
                className="btn outline small"
                type="button"
                style={{ flex: 1 }}
                onClick={() => setForm(null)}
              >
                취소
              </button>
              <button
                className="btn small"
                type="button"
                style={{ flex: 1 }}
                onClick={save}
                disabled={saving}
              >
                {saving ? "저장 중..." : "저장"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
