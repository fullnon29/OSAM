// 웹(서버)과 로컬 프로그램이 함께 쓰는 공용 모듈입니다(요구사항 11: 로컬+웹).
// next 의 server-only 가드를 두면 로컬 스크립트에서 불러올 수 없어 사용하지 않습니다.
// node 내장 모듈에 의존하므로 클라이언트 번들에는 어차피 포함될 수 없습니다.

// 보관 서류의 종류를 가려냅니다.
//
// 폴더에는 욕구사정 외에도 급여제공계획서·낙상/욕창평가·동의서 등이 섞여 있어
// (전수 조사 1,799건 중 욕구사정은 332건), 종류를 가리지 않으면 급여변경요청서를
// 욕구사정으로 잘못 읽게 됩니다.
//
// 한 파일에 여러 서식이 함께 편철된 경우가 흔해(욕구사정+급여제공계획 280건)
// 종류는 여러 개가 나올 수 있습니다.

export const DOC_TYPES = [
  "욕구사정",
  "급여제공계획",
  "낙상위험도",
  "욕창위험도",
  "인지(CIST)",
] as const;

export type DocType = (typeof DOC_TYPES)[number];

// 문서 제목이 본문 앞부분에 오므로 앞머리만 봅니다.
// 뒤쪽 본문에는 다른 서식을 가리키는 말이 스쳐 지나갈 수 있어 오탐이 늡니다.
const HEAD_CHARS = 1500;

const RULES: { type: DocType; pattern: RegExp }[] = [
  { type: "욕구사정", pattern: /욕구조사기록지|욕구사정|욕구조사/ },
  { type: "급여제공계획", pattern: /급여제공계획|장기요양이용계획/ },
  { type: "낙상위험도", pattern: /낙상위험도|Huhn/i },
  { type: "욕창위험도", pattern: /욕창위험도|Braden/i },
  { type: "인지(CIST)", pattern: /CIST|인지선별/i },
];

export function classifyDocument(text: string): DocType[] {
  const head = text.slice(0, HEAD_CHARS);
  return RULES.filter((r) => r.pattern.test(head)).map((r) => r.type);
}
