"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatKst } from "@/lib/format";

export type AdminNotice = {
  id: string;
  title: string;
  body: string;
  link_url: string | null;
  requires_ack: boolean;
  is_active: boolean;
  created_at: string;
  readCount: number;
  unread: string[];
};

const EMPTY = { title: "", body: "", linkUrl: "", requiresAck: true, push: true };

export default function NoticesAdminBoard({ notices, total }: { notices: AdminNotice[]; total: number }) {
  const router = useRouter();
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function post(payload: object) {
    const res = await fetch("/api/guide/admin-notices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (res.ok && json.push) {
      const p = json.push as { pushed: number; devices: number; errors: string[] };
      setInfo(
        p.devices === 0
          ? "공지를 올렸습니다. 푸시를 받을 수 있는 폰이 아직 없어 앱 알림만 갑니다(새 앱을 설치하고 알림을 허용한 폰이 대상입니다)."
          : `공지를 올렸습니다. 푸시를 ${p.devices}대 중 ${p.pushed}대에 보냈습니다.` + (p.errors.length ? ` (오류: ${p.errors[0]})` : "")
      );
    } else if (res.ok) setInfo("공지를 올렸습니다(푸시 알림은 보내지 않음).");
    return res.ok ? null : json.error || "처리 중 오류가 발생했습니다.";
  }

  async function save() {
    setSaving(true);
    setError(null);
    setInfo(null);
    const err = await post(form);
    setSaving(false);
    if (err) return setError(err);
    setForm(EMPTY);
    router.refresh();
  }

  async function hide(n: AdminNotice) {
    if (!confirm(`「${n.title}」 공지를 앱에서 내릴까요? (확인 기록은 남습니다)`)) return;
    const err = await post({ action: "hide", id: n.id });
    if (err) alert(err);
    router.refresh();
  }

  return (
    <div className="app-wrap">
      <div className="page-head">
        <div>
          <Link className="btn-ghost" href="/training/admin" style={{ marginBottom: 12, display: "inline-flex" }}>
            ← 교육 이수 관리로
          </Link>
          <h1>평가 길잡이 앱 공지</h1>
          <p>여기에 올린 공지는 선생님들 앱 첫 화면에 뜨고, 「확인했습니다」를 누른 기록이 남습니다.</p>
        </div>
      </div>

      <div className="log-panel" style={{ marginTop: 0, marginBottom: 20 }}>
        <h3>새 공지 올리기</h3>
        {error && <div className="form-error">{error}</div>}
        {info && <div style={{ background: "var(--accent-soft, #e9f3ef)", padding: "8px 12px", borderRadius: 8, fontSize: 14, marginTop: 8 }}>{info}</div>}
        <input
          placeholder="제목 (예: 11월 감염예방 교육 안내)"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          style={{ width: "100%", marginTop: 8 }}
        />
        <textarea
          rows={6}
          placeholder="내용 (선생님들이 읽을 글)"
          value={form.body}
          onChange={(e) => setForm({ ...form, body: e.target.value })}
          style={{ width: "100%", marginTop: 8 }}
        />
        <input
          placeholder="교육 자료 링크 (선택, https://...)"
          value={form.linkUrl}
          onChange={(e) => setForm({ ...form, linkUrl: e.target.value })}
          style={{ width: "100%", marginTop: 8 }}
        />
        <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8, fontSize: 14 }}>
          <input
            type="checkbox"
            checked={form.requiresAck}
            onChange={(e) => setForm({ ...form, requiresAck: e.target.checked })}
          />
          선생님이 「확인했습니다」를 눌러야 하는 공지
        </label>
        <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8, fontSize: 14 }}>
          <input type="checkbox" checked={form.push} onChange={(e) => setForm({ ...form, push: e.target.checked })} />
          선생님 폰에 푸시 알림 보내기
        </label>
        <button className="btn small" type="button" style={{ width: "auto", marginTop: 10 }} disabled={saving} onClick={save}>
          {saving ? "올리는 중..." : "공지 올리기"}
        </button>
      </div>

      <table className="admin-table">
        <thead>
          <tr>
            <th>올린 날</th>
            <th>제목</th>
            <th>확인</th>
            <th>상태</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {notices.length === 0 && (
            <tr>
              <td colSpan={5} style={{ textAlign: "center", color: "var(--ink-soft)" }}>
                아직 올린 공지가 없습니다.
              </td>
            </tr>
          )}
          {notices.map((n) => (
            <tr key={n.id} style={n.is_active ? undefined : { opacity: 0.5 }}>
              <td>{formatKst(n.created_at).slice(0, 10)}</td>
              <td>
                <button className="edit-link" type="button" onClick={() => setOpenId(openId === n.id ? null : n.id)}>
                  {n.title}
                </button>
                {openId === n.id && (
                  <div style={{ whiteSpace: "pre-line", fontSize: 13, marginTop: 6 }}>
                    {n.body}
                    {n.link_url && (
                      <div>
                        <a href={n.link_url} target="_blank" rel="noopener noreferrer">{n.link_url}</a>
                      </div>
                    )}
                    {n.requires_ack && n.unread.length > 0 && (
                      <div style={{ marginTop: 6, color: "var(--ink-soft)" }}>미확인: {n.unread.join(", ")}</div>
                    )}
                  </div>
                )}
              </td>
              <td>{n.requires_ack ? `${n.readCount} / ${total}명` : "확인 불필요"}</td>
              <td>
                <span className={`status ${n.is_active ? "done" : "todo"}`}>{n.is_active ? "게시 중" : "내림"}</span>
              </td>
              <td>
                {n.is_active && (
                  <button className="edit-link" type="button" onClick={() => hide(n)}>
                    내리기
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
