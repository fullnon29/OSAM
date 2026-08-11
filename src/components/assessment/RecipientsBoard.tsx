"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export type Recipient = {
  id: string;
  name: string;
  birth_date: string | null;
  gender: string | null;
  ltc_grade: string | null;
  is_active: boolean;
};

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

export default function RecipientsBoard({ recipients }: { recipients: Recipient[] }) {
  const router = useRouter();
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

      <div className="course-grid">
        {recipients.length === 0 && (
          <div className="empty-note">등록된 수급자가 없습니다.</div>
        )}
        {recipients.map((r) => (
          <Link className="course-card" key={r.id} href={`/assessment/recipients/${r.id}`}>
            <div className="cat">{r.ltc_grade ?? "등급 미상"}</div>
            <div className="name">{r.name}</div>
            <div className="meta">
              {r.birth_date ?? "생년월일 미상"} · {r.gender === "M" ? "남" : r.gender === "F" ? "여" : "성별 미상"}
            </div>
            <div className="row-actions">
              <span className={`status ${r.is_active ? "done" : "todo"}`}>
                {r.is_active ? "이용 중" : "종료"}
              </span>
              <span className="btn small">상세 보기</span>
            </div>
          </Link>
        ))}
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
