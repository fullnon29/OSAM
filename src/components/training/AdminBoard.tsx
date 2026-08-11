"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import CertModal, { type CertInfo } from "./CertModal";
import { formatKst, toKstInputValue } from "@/lib/format";

export type AdminCourse = { id: string; name: string };
export type AdminEmployee = { id: string; name: string; dept: string | null };
export type AdminCompletion = {
  employee_id: string;
  course_id: string;
  completed_at: string;
  cert_no: string;
};
export type AdminLog = {
  id: string;
  original_time: string;
  new_time: string;
  reason: string;
  edited_at: string;
  employee: { name: string } | null;
  course: { name: string } | null;
};

const fmt = formatKst;

export default function AdminBoard({
  courses,
  employees,
  completions,
  logs,
}: {
  courses: AdminCourse[];
  employees: AdminEmployee[];
  completions: AdminCompletion[];
  logs: AdminLog[];
}) {
  const router = useRouter();
  const [courseId, setCourseId] = useState(courses[0]?.id ?? "");
  const [cert, setCert] = useState<CertInfo | null>(null);
  const [editTarget, setEditTarget] = useState<{
    employeeId: string;
    employeeName: string;
    courseId: string;
    currentTime: string;
  } | null>(null);
  const [editReason, setEditReason] = useState("");
  const [editTime, setEditTime] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const completionMap = useMemo(() => {
    const m = new Map<string, AdminCompletion>();
    for (const c of completions) m.set(`${c.employee_id}__${c.course_id}`, c);
    return m;
  }, [completions]);

  const activeCourse = courses.find((c) => c.id === courseId);

  function openEdit(employeeId: string, employeeName: string, currentTime: string) {
    setEditTarget({ employeeId, employeeName, courseId, currentTime });
    setEditTime(toKstInputValue(currentTime));
    setEditReason("");
    setError(null);
  }

  async function saveEdit() {
    if (!editTarget) return;
    if (!editReason.trim()) {
      setError("수정 사유를 입력해 주세요.");
      return;
    }
    setSaving(true);
    setError(null);
    const res = await fetch("/api/training/admin/edit-time", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        employeeId: editTarget.employeeId,
        courseId: editTarget.courseId,
        newTime: editTime,
        reason: editReason,
      }),
    });
    const json = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(json.error || "수정 중 오류가 발생했습니다.");
      return;
    }
    setEditTarget(null);
    router.refresh();
  }

  async function markDone(employeeId: string) {
    setSaving(true);
    const res = await fetch("/api/training/admin/mark-done", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employeeId, courseId }),
    });
    setSaving(false);
    if (!res.ok) {
      const json = await res.json();
      alert(json.error || "처리 중 오류가 발생했습니다.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="app-wrap">
      <div className="page-head">
        <div>
          <h1>관리자 · 교육 이수 관리</h1>
          <p>교육을 선택하면 전 종사자의 이수 현황을 확인하고 완료 시각을 수정할 수 있습니다.</p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <Link className="btn outline small" href="/training/admin/employees">
            종사자 계정 관리
          </Link>
          <Link className="btn small" href="/training/admin/posts">
            소식·정보 글 관리
          </Link>
        </div>
      </div>

      <select
        className="select-course"
        value={courseId}
        onChange={(e) => setCourseId(e.target.value)}
      >
        {courses.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>

      <table className="admin-table">
        <thead>
          <tr>
            <th>종사자</th>
            <th>부서</th>
            <th>이수 상태</th>
            <th>완료 시각</th>
            <th>수료증</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {employees.map((emp) => {
            const c = completionMap.get(`${emp.id}__${courseId}`);
            return (
              <tr key={emp.id}>
                <td>{emp.name}</td>
                <td>{emp.dept ?? "-"}</td>
                <td>
                  <span className={`status ${c ? "done" : "todo"}`}>
                    {c ? "이수완료" : "미이수"}
                  </span>
                </td>
                <td>{c ? fmt(c.completed_at) : "-"}</td>
                <td>
                  {c ? (
                    <button
                      className="edit-link"
                      type="button"
                      onClick={() =>
                        setCert({
                          employeeName: emp.name,
                          courseName: activeCourse?.name ?? "",
                          completedAt: c.completed_at,
                          certNo: c.cert_no,
                          courseId,
                          employeeId: emp.id,
                        })
                      }
                    >
                      보기
                    </button>
                  ) : (
                    "-"
                  )}
                </td>
                <td>
                  {c ? (
                    <button
                      className="edit-link"
                      type="button"
                      onClick={() => openEdit(emp.id, emp.name, c.completed_at)}
                    >
                      시각 수정
                    </button>
                  ) : (
                    <button
                      className="edit-link"
                      type="button"
                      disabled={saving}
                      onClick={() => markDone(emp.id)}
                    >
                      완료 처리
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="log-panel">
        <h3>수정 이력</h3>
        <div>
          {logs.length === 0 && (
            <div className="log-item" style={{ color: "var(--ink-soft)" }}>
              아직 수정 이력이 없습니다.
            </div>
          )}
          {logs.map((log) => (
            <div className="log-item" key={log.id}>
              <b>{log.employee?.name ?? "알 수 없음"}</b> ·{" "}
              {log.course?.name ?? "알 수 없음"} — 완료시각{" "}
              <b>{fmt(log.original_time)}</b> → <b>{fmt(log.new_time)}</b>로 수정
              ({log.reason}) · 관리자 수정 · {fmt(log.edited_at)}
            </div>
          ))}
        </div>
      </div>

      <CertModal cert={cert} onClose={() => setCert(null)} />

      {editTarget && (
        <div className="modal-bg active" onClick={() => setEditTarget(null)}>
          <div className="cert edit-modal-box" onClick={(e) => e.stopPropagation()}>
            <button className="close-x" type="button" onClick={() => setEditTarget(null)}>
              ✕
            </button>
            <h2 style={{ fontSize: 18 }}>완료 시각 수정</h2>
            <p style={{ fontSize: 12.5, color: "var(--ink-soft)", marginTop: 4 }}>
              {editTarget.employeeName} · {activeCourse?.name}
            </p>
            {error && <div className="form-error">{error}</div>}
            <label>새 완료 시각</label>
            <input
              type="datetime-local"
              value={editTime}
              onChange={(e) => setEditTime(e.target.value)}
            />
            <label>수정 사유</label>
            <textarea
              rows={3}
              value={editReason}
              onChange={(e) => setEditReason(e.target.value)}
              placeholder="예: 시스템 오류로 등록 누락되어 관리자가 소급 등록함"
            />
            <div className="modal-actions">
              <button
                className="btn outline small"
                type="button"
                style={{ flex: 1 }}
                onClick={() => setEditTarget(null)}
              >
                취소
              </button>
              <button
                className="btn small"
                type="button"
                style={{ flex: 1 }}
                onClick={saveEdit}
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
