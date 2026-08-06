"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import CertModal, { type CertInfo } from "./CertModal";
import { toYoutubeEmbedUrl } from "@/lib/youtube";

export type CourseDetailData = {
  id: string;
  name: string;
  category: string;
  description: string | null;
  duration_min: number | null;
  youtube_url: string | null;
  material_url: string | null;
};

export default function CourseDetail({
  course,
  employeeName,
  alreadyDone,
}: {
  course: CourseDetailData;
  employeeName: string;
  alreadyDone: { completed_at: string; cert_no: string } | null;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cert, setCert] = useState<CertInfo | null>(
    alreadyDone
      ? {
          employeeName,
          courseName: course.name,
          completedAt: alreadyDone.completed_at,
          certNo: alreadyDone.cert_no,
          courseId: course.id,
        }
      : null
  );

  const embedUrl = toYoutubeEmbedUrl(course.youtube_url);

  async function handleComplete() {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/training/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ courseId: course.id }),
    });
    const json = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(json.error || "이수 처리 중 오류가 발생했습니다.");
      return;
    }

    setCert({
      employeeName,
      courseName: course.name,
      completedAt: json.completion.completed_at,
      certNo: json.completion.cert_no,
      courseId: course.id,
    });
  }

  return (
    <div className="app-wrap" style={{ maxWidth: 760 }}>
      <button
        className="btn outline small"
        type="button"
        style={{ width: "auto", marginBottom: 20 }}
        onClick={() => router.push("/training")}
      >
        ← 목록으로
      </button>
      <div className="detail-card">
        <h2 style={{ fontSize: 20, color: "var(--pine-deep)", marginBottom: 6 }}>
          {course.name}
        </h2>
        <p style={{ fontSize: 13, color: "var(--ink-soft)", marginBottom: 20 }}>
          {course.description ||
            `${course.category} · 완료 후 수료증이 자동 발급됩니다.`}
        </p>

        <div className="video-box">
          {embedUrl ? (
            <iframe
              src={embedUrl}
              title={course.name}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          ) : (
            <div
              style={{
                width: "100%",
                height: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--ochre-soft)",
                fontSize: 14.5,
              }}
            >
              ▶ 교육 영상이 아직 등록되지 않았습니다.
            </div>
          )}
        </div>

        {course.material_url ? (
          <div className="file-box">
            📄 교보재
            <a
              href={course.material_url}
              target="_blank"
              rel="noopener noreferrer"
              style={{ textDecoration: "underline", cursor: "pointer" }}
            >
              다운로드
            </a>
          </div>
        ) : null}

        {error && <div className="form-error">{error}</div>}

        <button
          className="btn"
          type="button"
          onClick={handleComplete}
          disabled={loading || !!cert}
        >
          {cert ? "이수완료됨" : loading ? "처리 중..." : "시청 완료 · 이수 처리"}
        </button>
      </div>

      <CertModal
        cert={cert}
        onClose={() => {
          setCert(null);
          router.push("/training");
        }}
      />
    </div>
  );
}
