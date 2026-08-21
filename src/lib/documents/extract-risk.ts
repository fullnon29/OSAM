// 낙상·욕창 위험도 평가와 인지선별검사(CIST) 결과를 읽어냅니다 (요구사항 10).
//
// 공단 평가에도 별도 지표로 들어갑니다:
//   "방문요양 12 위험도 평가 - 수급자의 낙상 및 욕창 위험도, 인지기능 상태를
//    정기적으로 평가합니다" (4점)
//
// 이 서식들은 점수표라 자리가 정해져 있어 AI 없이 그대로 읽을 수 있습니다.
// 대개 욕구사정과 한 파일에 이어 붙어 있어(전체 259건), 각 평가의 제목이
// 나온 지점부터 다음 평가 제목 전까지를 그 평가의 구간으로 봅니다.
//
// 웹과 로컬 프로그램이 함께 쓰는 공용 모듈이라 server-only 가드를 두지 않습니다.

export type RiskScore = {
  /** 합계 점수 */
  total: number;
  /** 서식에 적힌 해석 기준으로 판정한 위험 수준 */
  level: string;
  /** 작성자가 적은 기타의견 (공단 평가에서 판단근거로 인정되는 부분) */
  note: string | null;
  /** 평가일 */
  date: string | null;
};

export type RiskAssessments = {
  fall: RiskScore | null;
  pressureUlcer: RiskScore | null;
  cognition: { total: number; note: string | null; date: string | null } | null;
};

const FALL_TITLE = /Huhn의?\s*낙상위험도|낙상위험도\s*평가/i;
const BRADEN_TITLE = /Braden\s*scale|욕창위험도\s*평가/i;
const CIST_TITLE = /인지선별검사|CIST/i;

/** "2024 년 03 월 12 일" 형태의 날짜 */
const DATE_RE = /(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/;
/** "합계" 다음에 오는 "22점" */
const TOTAL_RE = /합계\s*[^0-9]{0,12}?(\d{1,3})\s*점/;
/** "기타의견" 뒤의 서술 (날짜 줄이 나오기 전까지) */
const NOTE_RE = /기타의견\s*([\s\S]{0,600}?)(?=\d{4}\s*년\s*\d{1,2}\s*월|직종\s*\/|$)/;

function sliceSection(text: string, title: RegExp, others: RegExp[]): string | null {
  const start = text.search(title);
  if (start < 0) return null;
  const rest = text.slice(start + 1);
  // 다음 평가 제목이 나오면 거기까지가 이 평가의 구간입니다.
  let end = rest.length;
  for (const other of others) {
    const at = rest.search(other);
    if (at >= 0 && at < end) end = at;
  }
  return rest.slice(0, end);
}

function parseDate(section: string): string | null {
  const m = section.match(DATE_RE);
  if (!m) return null;
  const [, y, mo, d] = m;
  return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

function parseNote(section: string): string | null {
  const m = section.match(NOTE_RE);
  const note = m?.[1]?.replace(/\s+/g, " ").trim();
  return note ? note : null;
}

// 서식에 적힌 해석 기준을 그대로 씁니다.
function fallLevel(total: number): string {
  if (total <= 4) return "낙상위험 낮음";
  if (total <= 10) return "낙상위험 높음";
  return "낙상위험 아주 높음";
}

function bradenLevel(total: number): string {
  if (total >= 19) return "위험 없음";
  if (total >= 15) return "약간의 위험 있음";
  if (total >= 13) return "중간 정도의 위험 있음";
  if (total >= 10) return "위험이 높음";
  return "위험이 매우 높음";
}

export function extractRiskAssessments(text: string): RiskAssessments {
  const fallSection = sliceSection(text, FALL_TITLE, [BRADEN_TITLE, CIST_TITLE]);
  const bradenSection = sliceSection(text, BRADEN_TITLE, [CIST_TITLE]);
  const cistSection = sliceSection(text, CIST_TITLE, []);

  let fall: RiskScore | null = null;
  if (fallSection) {
    const m = fallSection.match(TOTAL_RE);
    if (m) {
      const total = Number(m[1]);
      fall = { total, level: fallLevel(total), note: parseNote(fallSection), date: parseDate(fallSection) };
    }
  }

  let pressureUlcer: RiskScore | null = null;
  if (bradenSection) {
    const m = bradenSection.match(TOTAL_RE);
    if (m) {
      const total = Number(m[1]);
      pressureUlcer = {
        total,
        level: bradenLevel(total),
        note: parseNote(bradenSection),
        date: parseDate(bradenSection),
      };
    }
  }

  let cognition: RiskAssessments["cognition"] = null;
  if (cistSection) {
    const m = cistSection.match(TOTAL_RE);
    if (m) {
      cognition = { total: Number(m[1]), note: parseNote(cistSection), date: parseDate(cistSection) };
    }
  }

  return { fall, pressureUlcer, cognition };
}
