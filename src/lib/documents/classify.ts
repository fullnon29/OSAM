// 보관 서류의 종류를 가려냅니다.
//
// 폴더에는 욕구사정 외에도 급여제공계획서·낙상/욕창평가·계약서·업무일지 등이
// 섞여 있어, 종류를 가리지 않으면 계약서를 욕구사정으로 잘못 읽게 됩니다.
//
// 한 파일에 여러 서식이 함께 편철된 경우가 흔해 종류는 여러 개가 나올 수 있습니다.
//
// 웹과 로컬 프로그램이 함께 쓰는 공용 모듈이라 server-only 가드를 두지 않습니다.

export const DOC_TYPES = [
  "욕구사정",
  "급여제공계획",
  "낙상위험도",
  "욕창위험도",
  "인지(CIST)",
] as const;

export type DocType = (typeof DOC_TYPES)[number];

// 제목만으로 가릴 수 있는 서식들. 본문 앞부분에 제목이 옵니다.
const HEAD_CHARS = 1500;

const TITLE_RULES: { type: DocType; pattern: RegExp }[] = [
  { type: "급여제공계획", pattern: /급여제공계획|장기요양이용계획/ },
  { type: "낙상위험도", pattern: /낙상위험도|Huhn/i },
  { type: "욕창위험도", pattern: /욕창위험도|Braden/i },
  { type: "인지(CIST)", pattern: /CIST|인지선별/i },
];

// 욕구사정은 "욕구사정"이라는 말이 계약서·업무일지에도 스쳐 지나가 제목만으로는
// 가릴 수 없습니다. 대신 서식이 실제로 갖고 있는 영역 이름을 셉니다.
// 영역 이름은 개정될 때마다 달라지므로(옛 서식은 '재활상태', 2026년은
// '재활 및 신체기능') 연도별 표현을 함께 봅니다.
const SECTION_MARKERS: RegExp[] = [
  /인지기능/,
  /재활상태|재활\s*및\s*신체기능/,
  /판단근거/,
  /지지체계/,
  /희망하는\s*서비스/,
  /보유질환/,
  /일상생활기능/,
  /욕구조사기록지/,
];

// 계약서에도 한두 개는 스칠 수 있어 여러 개가 함께 있을 때만 인정합니다.
const MIN_SECTION_MARKERS = 3;

export function classifyDocument(text: string): DocType[] {
  const head = text.slice(0, HEAD_CHARS);
  const types = TITLE_RULES.filter((r) => r.pattern.test(head)).map((r) => r.type);

  const markerHits = SECTION_MARKERS.filter((re) => re.test(text)).length;
  if (markerHits >= MIN_SECTION_MARKERS) types.unshift("욕구사정");

  return types;
}
