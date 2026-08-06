"use client";

import { formatKst } from "@/lib/format";

export type CertInfo = {
  employeeName: string;
  courseName: string;
  completedAt: string;
  certNo: string;
  courseId: string;
  employeeId?: string;
};

export default function CertModal({
  cert,
  onClose,
}: {
  cert: CertInfo | null;
  onClose: () => void;
}) {
  if (!cert) return null;

  const params = new URLSearchParams({ courseId: cert.courseId });
  if (cert.employeeId) params.set("employeeId", cert.employeeId);
  const downloadHref = `/api/training/cert-download?${params.toString()}`;

  const dateStr = formatKst(cert.completedAt);

  return (
    <div className="modal-bg active" onClick={onClose}>
      <div className="cert" onClick={(e) => e.stopPropagation()}>
        <button className="close-x" onClick={onClose} type="button">
          ✕
        </button>
        <div className="cert-eyebrow">수료 증명서</div>
        <h2>수료증</h2>
        <div className="cert-name">{cert.employeeName}</div>
        <div className="cert-course">
          &quot;{cert.courseName}&quot; 교육 과정을 이수하였음을 증명합니다.
        </div>
        <div className="cert-meta">
          <span>이수일시: {dateStr}</span>
          <span>번호 {cert.certNo}</span>
        </div>
        <div className="modal-actions">
          <button className="btn outline small" onClick={onClose} type="button" style={{ flex: 1 }}>
            닫기
          </button>
          <a
            className="btn small"
            href={downloadHref}
            target="_blank"
            rel="noopener noreferrer"
            style={{ flex: 1, textAlign: "center" }}
          >
            문서 다운로드
          </a>
        </div>
      </div>
    </div>
  );
}
