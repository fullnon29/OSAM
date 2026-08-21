"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export type Recipient = {
  id: string;
  name: string;
  birth_date: string | null;
  gender: string | null;
  ltc_grade: string | null;
  ltc_number: string | null;
  guardian_name: string | null;
  is_active: boolean;
};

export type AssessmentInfo = { count: number; latest: string | null };

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
};

const EMPTY_FORM: FormState = {
  name: "",
  birth_date: "",
  gender: "",
  ltc_grade: "",
  ltc_number: "",
  address: "",
  guardian_name: "",
  guardian_phone: "",
  memo: "",
};

export default function RecipientsBoard({
  recipients,
  documentCounts,
  assessmentInfo,
  unmatchedCount,
}: {
  recipients: Recipient[];
  documentCounts: Record<string, number>;
  assessmentInfo: Record<string, AssessmentInfo>;
  unmatchedCount: number;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [gradeFilter, setGradeFilter] = useState("전체");
  const [activeFilter, setActiveFilter] = useState("전체");

  // 등급 단추는 실제 등록된 등급만 만들어, 쓰지 않는 값이 늘어서지 않게 합니다.
  const grades = useMemo(() => {
    const found = new Set<string>();
    for (const r of recipients) if (r.ltc_grade) found.add(r.ltc_grade);
    return ["전체", ...[...found].sort(), "미상"];
  }, [recipients]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return recipients.filter((r) => {
      if (gradeFilter === "미상" ? r.ltc_grade : gradeFilter !== "전체" && r.ltc_grade !== gradeFilter)
        return false;
      if (activeFilter === "이용중" && !r.is_active) return false;
      if (activeFilter === "종료" && r.is_active) return false;
      if (!q) return true;
      // 이름·인정번호·보호자로 찾습니다(현장에서 이 셋으로 찾습니다).
      return (
        r.name.toLowerCase().includes(q) ||
        (r.ltc_number ?? "").toLowerCase().includes(q) ||
        (r.guardian_name ?? "").toLowerCase().includes(q)
      );
    });
  }, [recipients, query, gradeFilter, activeFilter]);
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!form) return;
    if (!form.name.trim()) {
      setError("성명은 필수입니다.");
      return;
    }
    setSaving(true);
    setError(null);

    const res = await fetch("/api/assessment/recipients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const json = await res.json();
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
      <div className="page-head">
        <div>
          <h1>욕구사정 · 수급자 관리</h1>
          <p>어르신을 등록하고 회차별 욕구조사기록지를 작성·조회합니다.</p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {unmatchedCount > 0 && (
            <Link
              className="btn outline small"
              href="/assessment/documents/unmatched"
              style={{ width: "auto" }}
            >
              미연결 서류 {unmatchedCount}건
            </Link>
          )}
          <button
            className="btn small"
            type="button"
            onClick={() => {
              setForm({ ...EMPTY_FORM });
              setError(null);
            }}
          >
            + 신규 수급자 등록
          </button>
        </div>
      </div>

      <div className="list-toolbar">
        <div className="filter-row">
          {grades.map((g) => (
            <button
              key={g}
              type="button"
              className={`filter-tag ${gradeFilter === g ? "active" : ""}`}
              onClick={() => setGradeFilter(g)}
            >
              {g}
            </button>
          ))}
        </div>
        <div className="filter-row">
          {["전체", "이용중", "종료"].map((v) => (
            <button
              key={v}
              type="button"
              className={`filter-tag ${activeFilter === v ? "active" : ""}`}
              onClick={() => setActiveFilter(v)}
            >
              {v}
            </button>
          ))}
          <input
            className="list-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="이름 · 인정번호 · 보호자 검색"
          />
          <span className="list-count">조회 {filtered.length}명</span>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="empty-note">
          {recipients.length === 0 ? "등록된 수급자가 없습니다." : "조건에 맞는 수급자가 없습니다."}
        </div>
      ) : (
        <div className="list-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: 44 }}>번호</th>
                <th>이름</th>
                <th>생년월일</th>
                <th style={{ width: 50 }}>성별</th>
                <th style={{ width: 66 }}>등급</th>
                <th>인정번호</th>
                <th>보호자</th>
                <th style={{ width: 62 }}>서류</th>
                <th>욕구사정</th>
                <th style={{ width: 70 }}>상태</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => {
                const docs = documentCounts[r.id] ?? 0;
                const assess = assessmentInfo[r.id];
                return (
                  <tr key={r.id} onClick={() => router.push(`/assessment/recipients/${r.id}`)}>
                    <td className="num">{i + 1}</td>
                    <td className="strong">{r.name}</td>
                    <td>{r.birth_date ?? "-"}</td>
                    <td>{r.gender === "M" ? "남" : r.gender === "F" ? "여" : "-"}</td>
                    <td>{r.ltc_grade ?? "-"}</td>
                    <td className="mono">{r.ltc_number ?? "-"}</td>
                    <td>{r.guardian_name ?? "-"}</td>
                    <td className="num">{docs > 0 ? `${docs}건` : "-"}</td>
                    <td>
                      {assess
                        ? `${assess.count}회차${assess.latest ? ` · ${assess.latest}` : ""}`
                        : "-"}
                    </td>
                    <td>
                      <span className={`status ${r.is_active ? "done" : "todo"}`}>
                        {r.is_active ? "이용 중" : "종료"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

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
            <h2 style={{ fontSize: 18 }}>신규 수급자 등록</h2>
            {error && <div className="form-error">{error}</div>}

            <label>성명</label>
            <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />

            <label>생년월일</label>
            <input
              type="date"
              value={form.birth_date}
              onChange={(e) => setForm({ ...form, birth_date: e.target.value })}
            />

            <label>성별</label>
            <select value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}>
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
            <textarea value={form.memo} onChange={(e) => setForm({ ...form, memo: e.target.value })} />

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
