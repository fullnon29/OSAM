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
  role: string;
};

type FormState = {
  name: string;
  username: string;
  password: string;
  dept: string;
  hired_at: string;
  role: string;
};

const EMPTY_FORM: FormState = {
  name: "",
  username: "",
  password: "",
  dept: "",
  hired_at: "",
  role: "employee",
};

const ROLE_LABEL: Record<string, string> = {
  employee: "종사자",
  social_worker: "사회복지사",
  admin: "관리자",
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
  // 「평가 길잡이」 앱 연결 QR
  const [qr, setQr] = useState<{ name: string; code: string; qr: string; expiresAt: string } | null>(null);

  async function showQr(employeeId: string) {
    const res = await fetch("/api/guide/link-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employeeId }),
    });
    const json = await res.json();
    if (!res.ok) {
      alert(json.error || "QR 생성 중 오류가 발생했습니다.");
      return;
    }
    setQr(json);
  }

  // 「평가 길잡이」 앱 정보: 연결 확인용 생년월일·전화번호, 선생님이 입력한 담당 어르신·주의점
  const [info, setInfo] = useState<{
    employeeId: string;
    name: string;
    birth: string;
    phone: string;
    cares: { elderName: string; cautions: string }[];
    devices: { link_method: string; created_at: string; last_seen_at: string | null }[];
  } | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);

  async function openInfo(employeeId: string, name: string) {
    const res = await fetch(`/api/guide/staff?employeeId=${employeeId}`);
    const json = await res.json();
    if (!res.ok) {
      alert(json.error || "불러오기 중 오류가 발생했습니다.");
      return;
    }
    setInfoMsg(null);
    setInfo({ employeeId, name, ...json });
  }

  async function saveInfo() {
    if (!info) return;
    setInfoMsg("저장 중...");
    const res = await fetch("/api/guide/staff", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employeeId: info.employeeId, birth: info.birth, phone: info.phone }),
    });
    const json = await res.json();
    setInfoMsg(res.ok ? "저장했습니다. 이제 선생님이 앱에서 성함·생년월일·전화번호로 연결할 수 있습니다." : json.error || "저장 중 오류가 발생했습니다.");
  }

  async function unlinkApp(employeeId: string, name: string) {
    const res = await fetch(`/api/guide/devices?employeeId=${employeeId}`);
    const json = await res.json();
    const n = json.devices?.length ?? 0;
    if (!n) {
      alert(`${name} 님의 연결된 앱이 없습니다.`);
      return;
    }
    if (!confirm(`${name} 님의 앱 연결 ${n}개를 해제할까요? (폰 분실·교체·퇴사 시) 다시 쓰려면 QR로 새로 연결해야 합니다.`)) return;
    const r = await fetch("/api/guide/devices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employeeId }),
    });
    alert(r.ok ? "연결을 해제했습니다." : "해제 중 오류가 발생했습니다.");
  }

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
        role: form.role,
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
            <th>역할</th>
            <th>부서</th>
            <th>입사일</th>
            <th>상태</th>
            <th>등록일</th>
            <th>평가 길잡이 앱</th>
          </tr>
        </thead>
        <tbody>
          {employees.length === 0 && (
            <tr>
              <td colSpan={8} style={{ textAlign: "center", color: "var(--ink-soft)" }}>
                등록된 종사자가 없습니다.
              </td>
            </tr>
          )}
          {employees.map((emp) => (
            <tr key={emp.id}>
              <td>{emp.name}</td>
              <td>{emp.employee_no ?? "-"}</td>
              <td>{ROLE_LABEL[emp.role] ?? emp.role}</td>
              <td>{emp.dept ?? "-"}</td>
              <td>{emp.hired_at ?? "-"}</td>
              <td>
                <span className={`status ${emp.is_active ? "done" : "todo"}`}>
                  {emp.is_active ? "재직" : "비활성"}
                </span>
              </td>
              <td>{formatKst(emp.created_at)}</td>
              <td>
                {emp.is_active && (
                  <>
                    <button className="edit-link" type="button" onClick={() => openInfo(emp.id, emp.name)}>
                      앱 정보
                    </button>{" "}
                    <button className="edit-link" type="button" onClick={() => showQr(emp.id)}>
                      연결 QR
                    </button>{" "}
                    <button className="edit-link" type="button" onClick={() => unlinkApp(emp.id, emp.name)}>
                      해제
                    </button>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {info && (
        <div className="modal-bg active" onClick={() => setInfo(null)}>
          <div className="cert edit-modal-box" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
            <button className="close-x" type="button" onClick={() => setInfo(null)}>
              ✕
            </button>
            <h2 style={{ fontSize: 18 }}>{info.name} 님 · 평가 길잡이 앱</h2>
            <p style={{ fontSize: 12.5, color: "var(--ink-soft)", marginTop: 4 }}>
              선생님이 앱 첫 화면에서 입력한 성함·생년월일·전화번호가 여기 등록한 것과 같으면 QR 없이 연결됩니다.
            </p>
            <label>생년월일 6자리</label>
            <input
              inputMode="numeric"
              placeholder="예: 650312"
              value={info.birth}
              onChange={(e) => setInfo({ ...info, birth: e.target.value })}
            />
            <label>전화번호</label>
            <input
              inputMode="tel"
              placeholder="예: 010-1234-5678"
              value={info.phone}
              onChange={(e) => setInfo({ ...info, phone: e.target.value })}
            />
            <button className="btn small" type="button" style={{ width: "auto", marginTop: 10 }} onClick={saveInfo}>
              연결 정보 저장
            </button>
            {infoMsg && <p style={{ fontSize: 12.5, marginTop: 6 }}>{infoMsg}</p>}

            <h3 style={{ fontSize: 15, marginTop: 18 }}>담당 어르신 · 케어 시 주의점 (선생님 입력)</h3>
            {info.cares.length === 0 ? (
              <p style={{ fontSize: 13, color: "var(--ink-soft)" }}>아직 입력한 어르신이 없습니다.</p>
            ) : (
              info.cares.map((c, i) => (
                <div key={i} style={{ fontSize: 13, padding: "8px 0", borderBottom: "1px solid var(--line, #ddd)" }}>
                  <b>{c.elderName}</b>
                  <div style={{ whiteSpace: "pre-line", color: "var(--ink-soft)" }}>{c.cautions || "(주의점 없음)"}</div>
                </div>
              ))
            )}

            <h3 style={{ fontSize: 15, marginTop: 18 }}>연결된 앱</h3>
            {info.devices.length === 0 ? (
              <p style={{ fontSize: 13, color: "var(--ink-soft)" }}>연결된 앱이 없습니다.</p>
            ) : (
              info.devices.map((d, i) => (
                <div key={i} style={{ fontSize: 13 }}>
                  {d.link_method === "info" ? "정보 입력으로 연결" : "QR로 연결"} · {formatKst(d.created_at)}
                  {d.last_seen_at ? ` · 마지막 사용 ${formatKst(d.last_seen_at)}` : ""}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {qr && (
        <div className="modal-bg active" onClick={() => setQr(null)}>
          <div
            className="cert edit-modal-box"
            style={{ maxWidth: 380, textAlign: "center" }}
            onClick={(e) => e.stopPropagation()}
          >
            <button className="close-x" type="button" onClick={() => setQr(null)}>
              ✕
            </button>
            <h2 style={{ fontSize: 18 }}>{qr.name} 님 앱 연결</h2>
            <p style={{ fontSize: 13, color: "var(--ink-soft)", margin: "6px 0 10px" }}>
              선생님 폰에서 「평가 길잡이」 앱을 열고 「QR로 연결」을 눌러 이 화면을 비춰 주세요.
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr.qr} alt="앱 연결 QR" style={{ width: 260, height: 260, margin: "0 auto" }} />
            <p style={{ fontSize: 15, marginTop: 10 }}>
              카메라가 안 되면 코드 입력: <b style={{ letterSpacing: 2 }}>{qr.code}</b>
            </p>
            <p style={{ fontSize: 12, color: "var(--ink-soft)" }}>
              {formatKst(qr.expiresAt)}까지 1번만 쓸 수 있습니다.
            </p>
          </div>
        </div>
      )}

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

            <label>역할</label>
            <select
              className="select-course"
              style={{ marginBottom: 0 }}
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
            >
              <option value="employee">종사자</option>
              <option value="social_worker">사회복지사</option>
            </select>

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
