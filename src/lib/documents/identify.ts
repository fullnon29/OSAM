// 웹(서버)과 로컬 프로그램이 함께 쓰는 공용 모듈입니다(요구사항 11: 로컬+웹).
// next 의 server-only 가드를 두면 로컬 스크립트에서 불러올 수 없어 사용하지 않습니다.
// node 내장 모듈에 의존하므로 클라이언트 번들에는 어차피 포함될 수 없습니다.

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
// "성명" 라벨은 신청서에서 신청인(담당 사회복지사)에도 붙습니다.
// 그대로 쓰면 직원 이름이 수급자로 들어오므로 수급자 쪽 라벨만 인정합니다.
const NAME_AFTER_LABEL_RE = /수급자\s*명\s*[:：]?\s*([가-힣]{2,4})(?![가-힣])/;

// 이름 자리에 자주 끼어드는 말들. 실제 보관 자료 1,799건을 훑어 확인한 목록으로,
// 걸러내지 않으면 "장기요양"(498건)·"등급"(205건)이 이름으로 잡힙니다.
const NOT_A_NAME = new Set([
  // 직책
  "사회복지사", "관리책임자", "요양보호사", "간호사", "간호조무사",
  "센터장", "시설장", "물리치료사", "작성자", "보호자", "수급자명",
  // 서식 문구
  "장기요양", "인정번호", "등급", "수가변동", "방문요양", "급여제공",
  "욕구조사", "욕구사정", "성명", "생년월일", "주수발자",
]);

// 한글 2~4자만 이름으로 봅니다. 파일 경로에서 이름을 찾을 때
// "C:" 같은 조각이 이름으로 새는 것을 막습니다.
const HANGUL_NAME_RE = /^[가-힣]{2,4}$/;

function cleanName(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const name = raw.trim();
  if (!HANGUL_NAME_RE.test(name)) return null;
  if (NOT_A_NAME.has(name)) return null;
  return name;
}

/**
 * 파일명이나 폴더명에 이름이 들어 있는 경우:
 *   "...서식(이명복).hwp", "[강인수]2023입소이용신청서.hwp", ".../이명복/..."
 */
export function nameFromPath(filePath: string): string | null {
  const filename = filePath.split(/[\/]/).pop() ?? "";

  // 대괄호 표기는 파일명 어디에 있든 수급자를 가리킵니다.
  const bracketed = cleanName(filename.match(/\[([가-힣]{2,4})\]/)?.[1]);
  if (bracketed) return bracketed;

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

  // 신청서류는 본문 '성명'이 신청한 직원이고 수급자명은 파일명에만 있어,
  // 파일명 대괄호 표기가 있으면 그것을 가장 믿습니다.
  let name = filePath ? cleanName(filePath.split(/[\/]/).pop()?.match(/\[([가-힣]{2,4})\]/)?.[1]) : null;
  if (name) sources.name = "파일명";

  if (!name) {
    name = cleanName(text.match(NAME_BEFORE_LTC_RE)?.[1]);
    if (name) sources.name = "본문(인정번호 앞)";
  }

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
