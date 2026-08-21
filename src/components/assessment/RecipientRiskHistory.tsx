export type RiskScore = {
  total: number;
  level: string;
  note: string | null;
  date: string | null;
};

export type RiskRecord = {
  id: string;
  filename: string;
  risk_assessments: {
    fall: RiskScore | null;
    pressureUlcer: RiskScore | null;
  } | null;
};

// 공단 평가는 위험도 평가를 정기적으로(연 1회 이상) 했는지 봅니다.
// 가장 최근 평가가 1년을 넘겼으면 눈에 띄게 표시합니다.
const OVERDUE_DAYS = 365;

function daysSince(date: string | null): number | null {
  if (!date) return null;
  const then = new Date(date).getTime();
  if (Number.isNaN(then)) return null;
  return Math.floor((Date.now() - then) / 86400000);
}

function levelClass(level: string): string {
  if (level.includes("아주 높음") || level.includes("매우 높음")) return "risk-high";
  if (level.includes("높음")) return "risk-mid";
  if (level.includes("없음")) return "risk-low";
  return "risk-mid";
}

export default function RecipientRiskHistory({ records }: { records: RiskRecord[] }) {
  const rows = records
    .map((r) => ({
      id: r.id,
      filename: r.filename,
      fall: r.risk_assessments?.fall ?? null,
      ulcer: r.risk_assessments?.pressureUlcer ?? null,
    }))
    .filter((r) => r.fall || r.ulcer)
    .sort((a, b) => {
      const da = a.fall?.date ?? a.ulcer?.date ?? "";
      const db = b.fall?.date ?? b.ulcer?.date ?? "";
      return db.localeCompare(da);
    });

  if (rows.length === 0) {
    return (
      <>
        <h3 style={{ fontSize: 16, color: "var(--pine-deep)", marginBottom: 14 }}>
          낙상 · 욕창 위험도
        </h3>
        <div className="empty-note">보관 서류에서 확인된 위험도 평가가 없습니다.</div>
      </>
    );
  }

  const latestDate = rows[0].fall?.date ?? rows[0].ulcer?.date ?? null;
  const age = daysSince(latestDate);
  const overdue = age !== null && age > OVERDUE_DAYS;

  return (
    <>
      <h3 style={{ fontSize: 16, color: "var(--pine-deep)", marginBottom: 10 }}>
        낙상 · 욕창 위험도{" "}
        <span style={{ color: "var(--ink-soft)", fontWeight: 400 }}>({rows.length}회)</span>
        {overdue && (
          <span className="risk-overdue">
            최근 평가 {Math.floor(age / 30)}개월 전 · 연 1회 이상 필요
          </span>
        )}
      </h3>

      <div className="risk-list">
        {rows.map((r) => (
          <div className="risk-row" key={r.id}>
            <div className="risk-date">{r.fall?.date ?? r.ulcer?.date ?? "날짜 미상"}</div>
            <div className="risk-scores">
              {r.fall && (
                <span className={`risk-chip ${levelClass(r.fall.level)}`}>
                  낙상 {r.fall.total}점 · {r.fall.level}
                </span>
              )}
              {r.ulcer && (
                <span className={`risk-chip ${levelClass(r.ulcer.level)}`}>
                  욕창 {r.ulcer.total}점 · {r.ulcer.level}
                </span>
              )}
            </div>
            {(r.fall?.note || r.ulcer?.note) && (
              <p className="risk-note">{r.fall?.note ?? r.ulcer?.note}</p>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
