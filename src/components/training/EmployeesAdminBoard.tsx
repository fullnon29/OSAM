"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatKst } from "@/lib/format";

export type Employee = {
  id: string;
  employee_no: string | null;
  name: string;
  dept: string | null;
  hired_at: string | null;
  is_active: boolean;
  created_at: string;
};

type FormState = {
  name: string;
  username: string;
  password: string;
  dept: string;
  hired_at: string;
};

const EMPTY_FORM: FormState = {
  name: "",
  username: "",
  password: "",
  dept: "",
  hired_at: "",
};

export default function EmployeesAdminBoard({
  employees,
}: {
  employees: Employee[];
}) {
  const router = useRouter();
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!form) return;
    if (!form.name.trim() || !form.username.trim() || !form.password) {
      setError("이름, 아이디, 초기 비밀번호는 필수입니다.");
      return;
    }
    setSaving(true);
    setError(null);

    const res = await fetch("/api/admin/employees", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        username: form.username,
        password: form.password,
        dept: form.dept || null,
        hired_at: form.hired_at || null,
      }),
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
          <Link className="btn-ghost" href="/training/admin" style={{ marginBottom: 12, display: "inline-flex" }}>
            ← 교육 이수 관리로
          </Link>
          <h1>종사자 계정 관리</h1>
          <p>신규 종사자 계정을 추가하고 등록된 직원 목록을 확인합니다.</p>
        </div>
        <button
          className="btn small"
          type="button"
          onClick={() => {
            setForm({ ...EMPTY_FORM });
            setError(null);
          }}
        >
          + 신규 종사자 계정 추가
        </button>
      </div>

      <table className="admin-table">
        <thead>
          <tr>
            <th>이름</th>
            <th>아이디</th>
            <th>부서</th>
            <th>입사일</th>
            <th>상태</th>
            <th>등록일</th>
          </tr>
        </thead>
        <tbody>
          {employees.length === 0 && (
            <tr>
              <td colSpan={6} style={{ textAlign: "center", color: "var(--ink-soft)" }}>
                등록된 종사자가 없습니다.
              </td>
            </tr>
          )}
          {employees.map((emp) => (
            <tr key={emp.id}>
              <td>{emp.name}</td>
              <td>{emp.employee_no ?? "-"}</td>
              <td>{emp.dept ?? "-"}</td>
              <td>{emp.hired_at ?? "-"}</td>
              <td>
                <span className={`status ${emp.is_active ? "done" : "todo"}`}>
                  {emp.is_active ? "재직" : "비활성"}
                </span>
              </td>
              <td>{formatKst(emp.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {form && (
        <div className="modal-bg active" onClick={() => setForm(null)}>
          <div
            className="cert edit-modal-box"
            style={{ maxWidth: 380 }}
            onClick={(e) => e.stopPropagation()}
          >
            <button className="close-x" type="button" onClick={() => setForm(null)}>
              ✕
            </button>
            <h2 style={{ fontSize: 18 }}>신규 종사자 계정 추가</h2>
            {error && <div className="form-error">{error}</div>}

            <label>이름</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />

            <label>아이디 (로그인용, 영문/숫자)</label>
            <input
              type="text"
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              placeholder="예: kimminji"
            />

            <label>초기 비밀번호 (6자 이상)</label>
            <input
              type="text"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />

            <label>부서 (선택)</label>
            <input
              type="text"
              value={form.dept}
              onChange={(e) => setForm({ ...form, dept: e.target.value })}
              placeholder="예: 요양보호팀"
            />

            <label>입사일 (선택)</label>
            <input
              type="date"
              value={form.hired_at}
              onChange={(e) => setForm({ ...form, hired_at: e.target.value })}
            />

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
