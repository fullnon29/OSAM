// 「프로그램 관리자 및 사회복지사 업무수행 일지」를 읽습니다.
//
// 매월 방문하며 적어 두신 이 일지 안에는 욕구사정 항목이 그대로 들어 있어,
// 다음 욕구사정의 가장 좋은 밑감이 됩니다. AI 없이 규칙으로 읽습니다.
//
// 서식이 두 가지입니다.
//   구서식(hwp)  — 별지 제24호. "욕구사정" 아래 신체상태·질병·인지상태 …
//   신서식(pdf)  — 홈페이지에서 내려받는 것. "3. 수급자의 심신상태 및 환경변화"
//                  아래 항목마다 유지/악화/호전과 판단근거가 서술로 적혀 있습니다.
//
// 어느 날짜 일지에서 온 내용인지 함께 남겨, 초안에 출처를 표시합니다.

/** 우리 욕구사정 서식의 '의견 및 판단근거' 칸 코드 */
export type OpinionCode =
  | "s2_opinion"
  | "s3_opinion"
  | "s4_opinion"
  | "s6_opinion"
  | "s7_opinion"
  | "s8_opinion"
  | "s9_opinion";

export type WorklogItem = {
  /** 일지에 적혀 있던 항목 이름 (출처를 되짚기 위함) */
  label: string;
  /** 우리 서식의 어느 칸에 해당하는지 */
  code: OpinionCode | "summary";
  text: string;
};

export type Worklog = {
  /** 방문(상담)일. 적혀 있지 않으면 null */
  visitDate: string | null;
  items: WorklogItem[];
  /** 어느 서식으로 읽었는지 */
  form: "2026" | "별지24";
};

/* ── 줄바꿈 잇기 ───────────────────────────────────────────────
   PDF 는 칸 너비에 맞춰 낱말 가운데서도 줄을 끊고, 그 자리의 띄어쓰기는
   사라집니다. 무엇이 사라졌는지 알 방법이 없어 다음처럼 판단합니다.
     - 앞 줄이 문장부호로 끝나면 띄어 씁니다.
     - 뒷 줄이 조사로 시작하면 낱말 가운데가 끊긴 것이므로 붙입니다.
     - 그 밖에는 띄어 씁니다.
   드물게 어긋나지만 이 글은 사람이 검토하는 초안이고, AI로 다듬을 때는
   원본 줄을 그대로 넘겨 모델이 바르게 잇도록 합니다. */

const JOSA_START =
  /^(이|가|은|는|을|를|의|에|에서|에게|와|과|로|으로|도|만|께|부터|까지|보다|처럼|이며|이고|입니다|임|이나|라도)/;

/** 위 규칙에 따라 줄을 잇습니다. */
function joinLines(lines: string[]): string {
  const parts = lines.map((l) => l.trim()).filter(Boolean);
  if (!parts.length) return "";
  let out = parts[0];
  for (let i = 1; i < parts.length; i++) {
    const next = parts[i];
    const endsSentence = /[.!?。]$/.test(out);
    const startsJosa = JOSA_START.test(next);
    out += !endsSentence && startsJosa ? next : ` ${next}`;
  }
  return out.replace(/\s+/g, " ").trim();
}

function norm(line: string): string {
  return line.replace(/\s+/g, "");
}

/** 이 서식이 업무수행일지인지 봅니다. 파일 이름이 제각각이라 본문으로 판단합니다. */
export function isWorklog(rawText: string): boolean {
  if (!rawText) return false;
  const t = norm(rawText);
  if (!t.includes("업무수행일지") && !t.includes("업무수행일")) return false;
  return t.includes("별지제24호") || t.includes("수급자의심신상태") || t.includes("욕구조사");
}

/** "2026-07-03" 또는 "2018 년 12 월 24 일" 을 찾습니다. */
function parseVisitDate(rawText: string): string | null {
  const iso = rawText.match(/방문일시[\s\S]{0,60}?(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const ko = rawText.match(/(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/);
  if (ko) return `${ko[1]}-${ko[2].padStart(2, "0")}-${ko[3].padStart(2, "0")}`;
  return null;
}

/* ── 신서식 (홈페이지 PDF) ───────────────────────────────────── */

/**
 * "3. 수급자의 심신상태 및 환경변화" 아래 항목들.
 *
 * 항목 이름이 칸 너비에 걸려 "다. 일상생활 기 / 능" 처럼 갈라지기도 해서
 * 공백을 지운 뒤 맞춰 봅니다.
 */
const PDF_ITEMS: { match: string; label: string; code: OpinionCode | "summary" }[] = [
  { match: "가.식사및영양상태", label: "식사 및 영양상태", code: "s2_opinion" },
  { match: "가)보행", label: "보행", code: "s4_opinion" },
  { match: "나)신체기능", label: "신체기능", code: "s4_opinion" },
  { match: "다)배뇨·배변기능", label: "배뇨·배변기능", code: "s3_opinion" },
  { match: "가)위생관리", label: "위생관리", code: "s3_opinion" },
  { match: "나)일상생활수행", label: "일상생활수행", code: "s3_opinion" },
  { match: "라.인지기능", label: "인지기능", code: "s6_opinion" },
  { match: "마.행동증상", label: "행동증상", code: "s6_opinion" },
  { match: "바.가족및생활환경", label: "가족 및 생활환경", code: "s7_opinion" },
  { match: "사.기타및종합의견", label: "기타 및 종합의견", code: "summary" },
];

/** 항목 이름만 있고 내용이 없는 줄(묶음 제목)은 건너뜁니다. */
const PDF_SKIP = ["나.신체상태", "다.일상생활기", "능", "심신상태구분유지악화호전판단근거"];

function extractPdfForm(rawText: string): Worklog | null {
  const start = rawText.search(/3\s*\.\s*수급자의\s*심신상태/);
  if (start < 0) return null;
  const end = rawText.search(/4\s*\.\s*급여제공계획/);
  const body = rawText.slice(start, end > start ? end : undefined);
  const lines = body.split("\n");

  const items: WorklogItem[] = [];
  let current: (typeof PDF_ITEMS)[number] | null = null;
  let buffer: string[] = [];

  const flush = () => {
    if (!current) return;
    const text = joinLines(buffer)
      // 항목 앞머리에 붙는 "유지/악화/호전" 표시는 서술이 아닙니다.
      .replace(/^(유지|악화|호전)\s*/, "")
      .trim();
    if (text.length >= 5) items.push({ label: current.label, code: current.code, text });
    buffer = [];
  };

  for (const line of lines) {
    const n = norm(line);
    if (!n) continue;
    if (PDF_SKIP.includes(n)) continue;

    // 항목 이름이 줄 앞에 붙고 내용이 같은 줄에 이어지는 경우가 많습니다.
    const hit = PDF_ITEMS.find((it) => n.startsWith(it.match));
    if (hit) {
      flush();
      current = hit;
      const rest = line.replace(/\s+/g, " ").trim().slice(hit.label.length + 3);
      const tail = n.slice(hit.match.length);
      if (tail) buffer.push(rest.trim() || tail);
      continue;
    }
    if (current) buffer.push(line);
  }
  flush();

  if (!items.length) return null;
  return { visitDate: parseVisitDate(rawText), items, form: "2026" };
}

/* ── 구서식 (별지 제24호 hwp) ────────────────────────────────── */

const HWP_LABELS: { match: string; label: string; code: OpinionCode | "summary" }[] = [
  { match: "신체상태", label: "신체상태", code: "s3_opinion" },
  { match: "질병", label: "질병", code: "s2_opinion" },
  { match: "인지상태", label: "인지상태", code: "s6_opinion" },
  { match: "의사소통", label: "의사소통", code: "s6_opinion" },
  { match: "영양상태", label: "영양상태", code: "s2_opinion" },
  { match: "가족및환경", label: "가족 및 환경", code: "s7_opinion" },
  { match: "종합", label: "종합", code: "summary" },
];

function extractHwpForm(rawText: string): Worklog | null {
  const lines = rawText.split("\n");
  const normed = lines.map(norm);
  const start = normed.findIndex((l) => l === "욕구사정");
  if (start < 0) return null;

  const items: WorklogItem[] = [];
  let current: (typeof HWP_LABELS)[number] | null = null;
  let buffer: string[] = [];

  const flush = () => {
    if (!current) return;
    const text = joinLines(buffer);
    if (text.length >= 5) items.push({ label: current.label, code: current.code, text });
    buffer = [];
  };

  for (let i = start + 1; i < lines.length; i++) {
    const n = normed[i];
    if (n === "급여제공계획") break;
    const hit = HWP_LABELS.find((l) => l.match === n);
    if (hit) {
      flush();
      current = hit;
      continue;
    }
    if (current) buffer.push(lines[i]);
  }
  flush();

  if (!items.length) return null;
  return { visitDate: parseVisitDate(rawText), items, form: "별지24" };
}

/* ── 수급자 상담 ─────────────────────────────────────────────── */

/** 어르신·보호자가 직접 하신 말씀. 주관적 욕구 칸의 밑감입니다. */
function extractConsult(rawText: string): WorklogItem | null {
  const m = rawText.match(
    /6\s*\.\s*수급자\(보호자\)\s*상담([\s\S]*?)(?=7\s*\.\s*향후계획|$)/
  );
  const legacy = !m ? rawText.match(/보호자\s*상담\n([\s\S]*?)(?=급여\s*및\s*인지활동|급여제공자)/) : null;
  const body = m?.[1] ?? legacy?.[1];
  if (!body) return null;
  const text = joinLines(body.split("\n"));
  if (text.length < 5) return null;
  return { label: "수급자(보호자) 상담", code: "s9_opinion", text };
}

/** 업무수행일지에서 욕구사정에 쓸 서술을 읽어 냅니다. */
export function extractWorklog(rawText: string): Worklog | null {
  if (!rawText) return null;
  const result = extractPdfForm(rawText) ?? extractHwpForm(rawText);
  if (!result) return null;

  const consult = extractConsult(rawText);
  if (consult) result.items.push(consult);
  return result;
}
