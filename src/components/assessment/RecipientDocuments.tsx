import Link from "next/link";

export type CareDocument = {
  id: string;
  filename: string;
  doc_types: string[];
  ext: string;
  byte_size: number;
  created_at: string;
};

function formatSize(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
  return `${Math.round(bytes / 1024)}KB`;
}

export default function RecipientDocuments({ documents }: { documents: CareDocument[] }) {
  if (documents.length === 0) {
    return (
      <>
        <h3 style={{ fontSize: 16, color: "var(--pine-deep)", marginBottom: 14 }}>보관 서류</h3>
        <div className="empty-note">보관된 서류가 없습니다.</div>
      </>
    );
  }

  // 종류별로 몇 건인지 먼저 보여주면 무엇이 있는 어르신인지 한눈에 파악됩니다.
  const typeCounts = new Map<string, number>();
  for (const doc of documents) {
    for (const t of doc.doc_types.length ? doc.doc_types : ["기타"]) {
      typeCounts.set(t, (typeCounts.get(t) ?? 0) + 1);
    }
  }

  return (
    <>
      <h3 style={{ fontSize: 16, color: "var(--pine-deep)", marginBottom: 10 }}>
        보관 서류 <span style={{ color: "var(--ink-soft)", fontWeight: 400 }}>({documents.length}건)</span>
      </h3>
      <div className="doc-type-summary">
        {[...typeCounts.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([type, count]) => (
            <span className="doc-type-chip" key={type}>
              {type} {count}
            </span>
          ))}
      </div>
      <div className="doc-list">
        {documents.map((doc) => (
          <div className="doc-row" key={doc.id}>
            <div className="doc-main">
              <span className={`doc-ext ${doc.ext}`}>{doc.ext.toUpperCase()}</span>
              <span className="doc-name">{doc.filename}</span>
            </div>
            <div className="doc-meta">
              {doc.doc_types.length > 0 && (
                <span className="doc-types">{doc.doc_types.join(" · ")}</span>
              )}
              <span className="doc-size">{formatSize(doc.byte_size)}</span>
              <Link
                className="btn outline small"
                style={{ width: "auto", padding: "5px 12px", fontSize: 12 }}
                href={`/api/assessment/documents/${doc.id}`}
              >
                원본 열기
              </Link>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
