"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export type UnmatchedDocument = {
  id: string;
  filename: string;
  doc_types: string[];
  ext: string;
  extracted_name: string | null;
  extracted_ltc_grade: string | null;
};

export type RecipientOption = {
  id: string;
  name: string;
  ltc_grade: string | null;
  ltc_number: string | null;
};

export default function UnmatchedDocumentsBoard({
  documents,
  recipients,
}: {
  documents: UnmatchedDocument[];
  recipients: RecipientOption[];
}) {
  const router = useRouter();
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [doneIds, setDoneIds] = useState<Set<string>>(new Set());

  const byName = useMemo(() => {
    const map = new Map<string, RecipientOption[]>();
    for (const r of recipients) {
      const list = map.get(r.name) ?? [];
      list.push(r);
      map.set(r.name, list);
    }
    return map;
  }, [recipients]);

  async function link(docId: string) {
    const recipientId = picked[docId];
    if (!recipientId) {
      setError("수급자를 선택해 주세요.");
      return;
    }
    setSaving(docId);
    setError(null);

    const res = await fetch(`/api/assessment/documents/${docId}/link`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ care_recipient_id: recipientId }),
    });
    setSaving(null);

    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(json.error || "연결 중 오류가 발생했습니다.");
      return;
    }
    setDoneIds((prev) => new Set(prev).add(docId));
    router.refresh();
  }

  const remaining = documents.filter((d) => !doneIds.has(d.id));

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
          <h1>미연결 서류 정리</h1>
          <p>
            장기요양인정번호가 없어 자동으로 붙이지 못한 서류입니다. 이름이 같아도 동명이인이
            있을 수 있어, 확인하신 뒤 직접 연결해 주세요.
          </p>
        </div>
      </div>

      {error && <div className="form-error">{error}</div>}

      {remaining.length === 0 ? (
        <div className="empty-note">
          {documents.length === 0
            ? "미연결 서류가 없습니다."
            : "이 화면의 서류를 모두 정리했습니다."}
        </div>
      ) : (
        <>
          <p className="list-count" style={{ marginBottom: 12, marginLeft: 0 }}>
            남은 서류 {remaining.length}건
          </p>
          <div className="doc-list">
            {remaining.map((doc) => {
              // 서류에서 읽은 이름과 같은 수급자를 먼저 보여 주고,
              // 잘못 읽었을 수 있으므로 전체 목록도 함께 고를 수 있게 둡니다.
              const suggestions = doc.extracted_name ? byName.get(doc.extracted_name) ?? [] : [];
              return (
                <div className="doc-row unmatched-row" key={doc.id}>
                  <div className="doc-main">
                    <span className={`doc-ext ${doc.ext}`}>{doc.ext.toUpperCase()}</span>
                    <span className="doc-name">{doc.filename}</span>
                  </div>
                  <div className="unmatched-meta">
                    <span className="doc-types">
                      읽은 이름: <strong>{doc.extracted_name ?? "(찾지 못함)"}</strong>
                      {doc.extracted_ltc_grade ? ` · ${doc.extracted_ltc_grade}` : ""}
                    </span>
                    {suggestions.length > 1 && (
                      <span className="unmatched-warn">
                        같은 이름 {suggestions.length}명 · 인정번호로 확인 필요
                      </span>
                    )}
                  </div>
                  <div className="unmatched-actions">
                    <select
                      value={picked[doc.id] ?? ""}
                      onChange={(e) => setPicked((p) => ({ ...p, [doc.id]: e.target.value }))}
                    >
                      <option value="">수급자 선택</option>
                      {suggestions.length > 0 && (
                        <optgroup label="이름이 같은 수급자">
                          {suggestions.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.name} · {r.ltc_grade ?? "등급없음"} · {r.ltc_number ?? "번호없음"}
                            </option>
                          ))}
                        </optgroup>
                      )}
                      <optgroup label="전체 수급자">
                        {recipients.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name} · {r.ltc_grade ?? "등급없음"} · {r.ltc_number ?? "번호없음"}
                          </option>
                        ))}
                      </optgroup>
                    </select>
                    <a
                      className="btn outline small"
                      style={{ width: "auto", padding: "7px 12px", fontSize: 12 }}
                      href={`/api/assessment/documents/${doc.id}`}
                    >
                      원본 확인
                    </a>
                    <button
                      className="btn small"
                      type="button"
                      style={{ width: "auto", padding: "7px 16px", fontSize: 12 }}
                      onClick={() => link(doc.id)}
                      disabled={saving === doc.id}
                    >
                      {saving === doc.id ? "연결 중..." : "연결"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
