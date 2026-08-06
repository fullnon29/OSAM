"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import CertModal, { type CertInfo } from "./CertModal";
import { formatKst } from "@/lib/format";

export type Course = {
  id: string;
  name: string;
  category: string;
  duration_min: number | null;
};

export type CompletionMap = Record<
  string,
  { completed_at: string; cert_no: string }
>;

export default function CourseBoard({
  employeeName,
  courses,
  completions,
}: {
  employeeName: string;
  courses: Course[];
  completions: CompletionMap;
}) {
  const categories = useMemo(
    () => ["전체", ...Array.from(new Set(courses.map((c) => c.category)))],
    [courses]
  );
  const [activeFilter, setActiveFilter] = useState("전체");
  const [search, setSearch] = useState("");
  const [cert, setCert] = useState<CertInfo | null>(null);

  const doneCount = courses.filter((c) => completions[c.id]).length;
  const total = courses.length;
  const progressPct = total === 0 ? 0 : Math.round((doneCount / total) * 100);

  const filtered = courses.filter((c) => {
    const matchesFilter = activeFilter === "전체" || c.category === activeFilter;
    const q = search.trim().toLowerCase();
    const matchesSearch =
      !q || c.name.toLowerCase().includes(q) || c.category.toLowerCase().includes(q);
    return matchesFilter && matchesSearch;
  });

  return (
    <div className="app-wrap">
      <div className="page-head">
        <div>
          <h1>안녕하세요, {employeeName}님</h1>
          <p>오늘도 어르신을 위해 애써주셔서 감사합니다. 필요한 교육을 골라 학습하세요.</p>
        </div>
      </div>

      <div className="app-stat-grid">
        <div className="app-stat-card">
          <div className="icon">📚</div>
          <div className="lbl">총 교육</div>
          <div className="val">{total}개</div>
        </div>
        <div className="app-stat-card">
          <div className="icon">✅</div>
          <div className="lbl">이수 완료</div>
          <div className="val">{doneCount}개</div>
        </div>
        <div className="app-stat-card">
          <div className="icon">⏱️</div>
          <div className="lbl">학습 중</div>
          <div className="val">0개</div>
        </div>
        <div className="app-stat-card">
          <div className="icon">📊</div>
          <div className="lbl">전체 진도율</div>
          <div className="val">{progressPct}%</div>
        </div>
      </div>

      <div className="filter-bar">
        <div className="filter-row">
          {categories.map((tag) => (
            <button
              key={tag}
              type="button"
              className={`filter-tag ${activeFilter === tag ? "active" : ""}`}
              onClick={() => setActiveFilter(tag)}
            >
              {tag}
            </button>
          ))}
        </div>
        <input
          className="search-box"
          type="text"
          placeholder="교육명, 카테고리 검색"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="course-grid">
        {filtered.length === 0 && (
          <div className="empty-note">조건에 맞는 교육이 없습니다.</div>
        )}
        {filtered.map((course) => {
          const done = completions[course.id];
          return (
            <div className="course-card" key={course.id}>
              <div className="cat">{course.category}</div>
              <div className="name">{course.name}</div>
              <div className="meta">
                {done
                  ? `이수완료 · ${formatKst(done.completed_at)}`
                  : `2026년 필수교육 · 약 ${course.duration_min ?? 20}분`}
              </div>
              <div className="row-actions">
                <span className={`status ${done ? "done" : "todo"}`}>
                  {done ? "이수완료" : "미이수"}
                </span>
                {done ? (
                  <button
                    className="btn outline small"
                    type="button"
                    onClick={() =>
                      setCert({
                        employeeName,
                        courseName: course.name,
                        completedAt: done.completed_at,
                        certNo: done.cert_no,
                        courseId: course.id,
                      })
                    }
                  >
                    수료증 보기
                  </button>
                ) : (
                  <Link className="btn small" href={`/training/${course.id}`}>
                    수강하기
                  </Link>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <CertModal cert={cert} onClose={() => setCert(null)} />
    </div>
  );
}
