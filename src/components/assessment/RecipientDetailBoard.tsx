"use client";

import Link from "next/link";
import { formatKst } from "@/lib/format";
import type { Recipient } from "./RecipientsBoard";

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
}: {
  recipient: Recipient & {
    ltc_number: string | null;
    address: string | null;
    guardian_name: string | null;
    guardian_phone: string | null;
    memo: string | null;
  };
  assessments: AssessmentSummary[];
}) {
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
          </p>
        </div>
        <Link className="btn small" href={`/assessment/recipients/${recipient.id}/assessments/new`}>
          + 새 회차 작성
        </Link>
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
        {recipient.memo && (
          <div className="info-line">
            <div className="k">비고</div>
            <div>{recipient.memo}</div>
          </div>
        )}
      </div>

      <h3 style={{ fontSize: 16, color: "var(--pine-deep)", marginBottom: 14 }}>
        욕구조사 이력
      </h3>
      {assessments.length === 0 && (
        <div className="empty-note">아직 작성된 욕구조사기록지가 없습니다.</div>
      )}
      {assessments.map((a) => (
        <Link
          className="assess-round-card"
          key={a.id}
          href={`/assessment/recipients/${recipient.id}/assessments/${a.id}`}
        >
          <div>
            <span className="round-no">{a.round_no}회차</span>
            <span style={{ marginLeft: 10, fontSize: 13, color: "var(--ink-soft)" }}>
              작성(방문사정)일 {a.assessed_at}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span className={`status ${a.status === "completed" ? "done" : "todo"}`}>
              {a.status === "completed" ? "완료" : "작성중"}
            </span>
            <span style={{ fontSize: 12, color: "var(--ink-soft)" }}>{formatKst(a.created_at)}</span>
          </div>
        </Link>
      ))}
    </div>
  );
}
