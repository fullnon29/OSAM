import "server-only";

// 서류에서 수급자를 식별하는 핵심 키 3가지를 뽑아냅니다(요구사항 4).
//   1. 수급자명  2. 장기요양등급  3. 장기요양인정번호
//
// 서식이 연도마다 달라 위치로는 찾을 수 없으므로, 어느 서식에서나 같은 모양으로
// 나타나는 라벨과 값의 생김새를 근거로 찾습니다. 확실하지 않은 값은 비워 두고
// 사람이 확인하도록 두는 편이, 틀린 값으로 엉뚱한 수급자에 묶이는 것보다 낫습니다.

export type DocumentIdentity = {
  name: string | null;
  ltcGrade: string | null;
  ltcNumber: string | null;
  /** 어떤 근거로 찾았는지 - 검토 화면에서 판단 재료로 씁니다 */
  sources: { name?: string; ltcGrade?: string; ltcNumber?: string };
};

// 장기요양인정번호: L + 숫자 10자리 (예: L1910024673)
const LTC_NUMBER_RE = /L\s*(\d{10})/;

// 등급: "3등급", "인지지원등급"
const GRADE_RE = /(인지지원|[1-5])\s*등급/;

// 이름은 라벨 바로 뒤가 아니라 표 구조 때문에 다른 칸을 건너뛴 뒤에 나옵니다
// (예: "수급자명 사회복지사 관리책임자 이명복 장기요양인정번호").
// 그래서 "인정번호 라벨 직전의 한국어 이름"을 가장 신뢰합니다.
const NAME_BEFORE_LTC_RE = /([가-힣]{2,4})\s*(?:장기요양인정번호|인정번호)/;
const NAME_AFTER_LABEL_RE = /(?:수급자\s*명|성\s*명)\s*[:：]?\s*([가-힣]{2,4})(?![가-힣])/;

// 직책·기관어가 이름으로 잡히는 것을 막습니다.
const NOT_A_NAME = new Set([
  "사회복지사", "관리책임자", "요양보호사", "간호사", "간호조무사",
  "수급자명", "보호자", "작성자", "센터장", "시설장", "물리치료사",
]);

function cleanName(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const name = raw.trim();
  if (name.length < 2 || name.length > 4) return null;
  if (NOT_A_NAME.has(name)) return null;
  return name;
}

/** 파일명이나 폴더명에 이름이 들어 있는 경우: "...서식(이명복).hwp", ".../이명복/..." */
export function nameFromPath(filePath: string): string | null {
  const parenthesized = filePath.match(/\(([가-힣]{2,4})\)\s*\.[A-Za-z]+$/);
  const fromParens = cleanName(parenthesized?.[1]);
  if (fromParens) return fromParens;

  const segments = filePath.split(/[\\/]/).slice(0, -1);
  for (const segment of segments.reverse()) {
    const candidate = cleanName(segment);
    if (candidate) return candidate;
  }
  return null;
}

export function identifyDocument(text: string, filePath?: string): DocumentIdentity {
  const sources: DocumentIdentity["sources"] = {};

  const ltcNumberMatch = text.match(LTC_NUMBER_RE);
  const ltcNumber = ltcNumberMatch ? `L${ltcNumberMatch[1]}` : null;
  if (ltcNumber) sources.ltcNumber = "본문";

  const gradeMatch = text.match(GRADE_RE);
  const ltcGrade = gradeMatch ? `${gradeMatch[1]}등급` : null;
  if (ltcGrade) sources.ltcGrade = "본문";

  let name = cleanName(text.match(NAME_BEFORE_LTC_RE)?.[1]);
  if (name) sources.name = "본문(인정번호 앞)";

  if (!name) {
    name = cleanName(text.match(NAME_AFTER_LABEL_RE)?.[1]);
    if (name) sources.name = "본문(성명 라벨)";
  }
  if (!name && filePath) {
    name = nameFromPath(filePath);
    if (name) sources.name = "파일 경로";
  }

  return { name, ltcGrade, ltcNumber, sources };
}
