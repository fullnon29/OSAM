"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatKst } from "@/lib/format";

export type AdminMemo = { id: string; staff: string; elder: string; body: string; createdAt: string; read: boolean };
export type AdminAlertDay = { date: string; total: number; pushed: number; acked: number; unacked: string[]; noPush: string[] };

export default function MemosAdminBoard({ memos, alertDays }: { memos: AdminMemo[]; alertDays: AdminAlertDay[] }) {
  const router = useRouter();
  const [showRead, setShowRead] = useState(false);

  async function mark(id: string, read: boolean) {
    const res = await fetch("/api/guide/admin-memos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, read }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(j.error || "처리 중 오류가 발생했습니다.");
      return;
    }
    router.refresh();
  }

  const unread = memos.filter((m) => !m.read).length;
  const list = memos.filter((m) => showRead || !m.read);

  return (
    <div className="app-wrap">
      <div className="page-head">
        <div>
          <Link className="btn-ghost" href="/training/admin" style={{ marginBottom: 12, display: "inline-flex" }}>
            ← 교육 이수 관리로
          </Link>
          <h1>앱 메모함 · 주말·휴일 안내 확인</h1>
          <p>선생님이 앱에서 센터에 남긴 메모와, 쉬는 날 전에 보낸 안내를 누가 확인했는지 봅니다.</p>
        </div>
      </div>

      <h3 style={{ marginBottom: 8 }}>주말·휴일 안내 확인 현황</h3>
      <table className="admin-table" style={{ marginBottom: 28 }}>
        <thead>
          <tr>
            <th>안내한 날</th>
            <th>대상</th>
            <th>푸시 보냄</th>
            <th>앱에서 확인</th>
            <th>아직 확인 안 한 선생님</th>
          </tr>
        </thead>
        <tbody>
          {alertDays.length === 0 && (
            <tr>
              <td colSpan={5} style={{ textAlign: "center", color: "var(--ink-soft)" }}>
                아직 보낸 안내가 없습니다.
              </td>
            </tr>
          )}
          {alertDays.map((d) => (
            <tr key={d.date}>
              <td>{d.date}</td>
              <td>{d.total}명</td>
              <td>
                {d.pushed}명
                {d.noPush.length > 0 && <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>푸시 못 받음: {d.noPush.join(", ")}</div>}
              </td>
              <td>{d.acked}명</td>
              <td style={{ fontSize: 13 }}>{d.unacked.length ? d.unacked.join(", ") : "모두 확인"}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 8 }}>
        <h3 style={{ margin: 0 }}>메모함 {unread > 0 && <span style={{ color: "var(--warn, #b8741a)" }}>· 안 읽은 메모 {unread}건</span>}</h3>
        <label style={{ fontSize: 13, display: "flex", gap: 6, alignItems: "center" }}>
          <input type="checkbox" checked={showRead} onChange={(e) => setShowRead(e.target.checked)} /> 읽은 메모도 보기
        </label>
      </div>
      <table className="admin-table">
        <thead>
          <tr>
            <th>남긴 시각</th>
            <th>선생님</th>
            <th>어르신</th>
            <th>메모</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {list.length === 0 && (
            <tr>
              <td colSpan={5} style={{ textAlign: "center", color: "var(--ink-soft)" }}>
                {showRead ? "남긴 메모가 없습니다." : "안 읽은 메모가 없습니다."}
              </td>
            </tr>
          )}
          {list.map((m) => (
            <tr key={m.id} style={m.read ? { opacity: 0.55 } : undefined}>
              <td style={{ whiteSpace: "nowrap" }}>{formatKst(m.createdAt)}</td>
              <td>{m.staff}</td>
              <td>{m.elder}</td>
              <td style={{ whiteSpace: "pre-line" }}>{m.body}</td>
              <td>
                <button className="edit-link" type="button" onClick={() => mark(m.id, !m.read)}>
                  {m.read ? "안 읽음으로" : "읽음"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
