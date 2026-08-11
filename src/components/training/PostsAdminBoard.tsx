"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { POST_CATEGORIES, type Post } from "@/lib/posts";
import { formatKst } from "@/lib/format";

type FormState = {
  id?: string;
  title: string;
  category: string;
  excerpt: string;
  content: string;
  read_minutes: string;
  is_published: boolean;
  thumbnail_url: string;
};

const EMPTY_FORM: FormState = {
  title: "",
  category: POST_CATEGORIES[0],
  excerpt: "",
  content: "",
  read_minutes: "",
  is_published: true,
  thumbnail_url: "",
};

export default function PostsAdminBoard({ posts }: { posts: Post[] }) {
  const router = useRouter();
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openCreate() {
    setForm({ ...EMPTY_FORM });
    setError(null);
  }

  function openEdit(post: Post) {
    setForm({
      id: post.id,
      title: post.title,
      category: post.category,
      excerpt: post.excerpt ?? "",
      content: post.content,
      read_minutes: post.read_minutes ? String(post.read_minutes) : "",
      is_published: post.is_published,
      thumbnail_url: post.thumbnail_url ?? "",
    });
    setError(null);
  }

  async function save() {
    if (!form) return;
    if (!form.title.trim() || !form.content.trim()) {
      setError("제목과 본문은 필수입니다.");
      return;
    }
    setSaving(true);
    setError(null);

    const payload = {
      title: form.title,
      category: form.category,
      excerpt: form.excerpt,
      content: form.content,
      read_minutes: form.read_minutes ? Number(form.read_minutes) : null,
      is_published: form.is_published,
      thumbnail_url: form.thumbnail_url,
    };

    const res = await fetch(
      form.id ? `/api/admin/posts/${form.id}` : "/api/admin/posts",
      {
        method: form.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    );
    const json = await res.json();
    setSaving(false);

    if (!res.ok) {
      setError(json.error || "저장 중 오류가 발생했습니다.");
      return;
    }

    setForm(null);
    router.refresh();
  }

  async function remove(id: string) {
    if (!confirm("이 글을 삭제할까요? 삭제하면 되돌릴 수 없습니다.")) return;
    const res = await fetch(`/api/admin/posts/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const json = await res.json();
      alert(json.error || "삭제 중 오류가 발생했습니다.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="app-wrap">
      <div className="page-head">
        <div>
          <Link className="btn-ghost" href="/training/admin" style={{ marginBottom: 12, display: "inline-flex" }}>
            ← 교육 이수 관리로
          </Link>
          <h1>소식·정보 게시글 관리</h1>
          <p>홈페이지 소식·정보 섹션에 노출되는 글을 작성/수정/삭제합니다.</p>
        </div>
        <button className="btn small" type="button" onClick={openCreate}>
          + 새 글 작성
        </button>
      </div>

      <table className="admin-table">
        <thead>
          <tr>
            <th>제목</th>
            <th>카테고리</th>
            <th>공개 여부</th>
            <th>출처</th>
            <th>작성일</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {posts.length === 0 && (
            <tr>
              <td colSpan={6} style={{ textAlign: "center", color: "var(--ink-soft)" }}>
                등록된 글이 없습니다.
              </td>
            </tr>
          )}
          {posts.map((post) => (
            <tr key={post.id}>
              <td>{post.title}</td>
              <td>{post.category}</td>
              <td>
                <span className={`status ${post.is_published ? "done" : "todo"}`}>
                  {post.is_published ? "공개" : "비공개"}
                </span>
              </td>
              <td>
                {post.source === "nhis" ? (
                  <a
                    href={post.source_url ?? undefined}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: "var(--ochre)", fontWeight: 700, fontSize: 12.5 }}
                  >
                    자동수집(공단) ↗
                  </a>
                ) : (
                  <span style={{ color: "var(--ink-soft)", fontSize: 12.5 }}>직접 작성</span>
                )}
              </td>
              <td>{formatKst(post.created_at)}</td>
              <td style={{ display: "flex", gap: 10 }}>
                <button className="edit-link" type="button" onClick={() => openEdit(post)}>
                  수정
                </button>
                <button className="edit-link" type="button" onClick={() => remove(post.id)}>
                  삭제
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {form && (
        <div className="modal-bg active" onClick={() => setForm(null)}>
          <div
            className="cert edit-modal-box"
            style={{ maxWidth: 560 }}
            onClick={(e) => e.stopPropagation()}
          >
            <button className="close-x" type="button" onClick={() => setForm(null)}>
              ✕
            </button>
            <h2 style={{ fontSize: 18 }}>{form.id ? "글 수정" : "새 글 작성"}</h2>
            {error && <div className="form-error">{error}</div>}

            <label>제목</label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />

            <label>카테고리</label>
            <select
              className="select-course"
              style={{ marginBottom: 0 }}
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            >
              {POST_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>

            <label>대표 이미지 URL (선택, 비워두면 카테고리 기본 이미지 사용)</label>
            <input
              type="text"
              placeholder="https://..."
              value={form.thumbnail_url}
              onChange={(e) => setForm({ ...form, thumbnail_url: e.target.value })}
            />

            <label>요약 (목록 카드에 표시)</label>
            <textarea
              rows={2}
              value={form.excerpt}
              onChange={(e) => setForm({ ...form, excerpt: e.target.value })}
            />

            <label>본문</label>
            <textarea
              rows={8}
              value={form.content}
              onChange={(e) => setForm({ ...form, content: e.target.value })}
            />

            <label>예상 읽기 시간(분, 선택)</label>
            <input
              type="number"
              min={1}
              value={form.read_minutes}
              onChange={(e) => setForm({ ...form, read_minutes: e.target.value })}
            />

            <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 14 }}>
              <input
                type="checkbox"
                style={{ width: "auto" }}
                checked={form.is_published}
                onChange={(e) => setForm({ ...form, is_published: e.target.checked })}
              />
              바로 공개
            </label>

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
