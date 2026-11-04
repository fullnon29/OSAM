// 월초 「서비스일정표」 PDF(한 쪽에 어르신 한 분, 달력 7칸×주) 를 읽어 방문 일정으로 바꾼다.
// 관리자 브라우저에서 pdf.js(unpdf) 로 글자와 자리를 뽑아 이 함수에 넘긴다(파일이 커서 서버로 올리지 않음).
// 서버 쪽 재검사·시험 스크립트도 같은 함수를 쓴다. (금액·등급은 읽지 않는다)

export type TextItem = { str: string; x: number; y: number; w?: number }; // pdf 좌표(y 는 아래에서 위로), w=글자 폭

export type ParsedVisit = {
  day: number;
  start: string; // "08:00"
  end: string; // "12:00"
  service: string; // "방문요양", "★관리자방문" …
  staff: string; // 그 방문을 맡은 직원 이름
  tags: string[]; // 「가족」(가족인 요양보호사) 「인지」 등 칸 표시
};

export type ParsedSchedulePage = {
  page: number; // 1부터
  elder: string;
  staffHeader: string[]; // 「방문직원:」 칸의 이름들
  visits: ParsedVisit[];
  warnings: string[];
};

export type ParsedSchedule = {
  month: string | null; // "2026-11"
  pages: ParsedSchedulePage[];
};

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
const TIME_RE = /^(\d{1,2}):(\d{2})~(\d{1,2}):(\d{2})$/;
const pad = (n: string) => n.padStart(2, "0");

// 같은 줄(y 가 거의 같음)에 붙어 있는 조각들을 이어 붙인다. "08" ":" "00" "~" … → "08:00~12:00"
function joinLines(items: TextItem[]): { text: string; x: number; y: number }[] {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: { parts: TextItem[]; y: number }[] = [];
  for (const it of sorted) {
    const line = lines.find((l) => Math.abs(l.y - it.y) <= 2);
    if (line) line.parts.push(it);
    else lines.push({ parts: [it], y: it.y });
  }
  return lines.map((l) => {
    const parts = l.parts.sort((a, b) => a.x - b.x);
    // 조각 사이가 떨어져 있으면 띄어 쓴다(「유은정 유병은」), 붙어 있으면 그냥 잇는다(「08:00」)
    let text = "";
    parts.forEach((p, k) => {
      const prev = parts[k - 1];
      if (prev && prev.w !== undefined && p.x - (prev.x + prev.w) > 1.5) text += " ";
      text += p.str;
    });
    return { text: text.trim(), x: parts[0].x, y: l.y };
  });
}

// k 번째 글자부터 같은 줄의 조각을 이어 붙여 「HH:MM~HH:MM」 가 되면 그 시간과 다음 글자 자리(end)를 돌려준다
function readTime(items: TextItem[], k: number) {
  const it = items[k];
  if (!/^\d{1,2}(:\d{0,2})?/.test(it.str)) return null;
  let text = "";
  let j = k;
  while (j < items.length && j - k < 12 && Math.abs(items[j].y - it.y) <= 1.5) {
    text += items[j].str.replace(/\s/g, "");
    j++;
    if (TIME_RE.test(text)) break;
  }
  const m = text.match(TIME_RE);
  return m ? { text, m, end: j } : null;
}

export function parseSchedulePage(items: TextItem[], pageNo: number): ParsedSchedulePage & { month: string | null } {
  const warnings: string[] = [];
  const clean = items.filter((i) => i.str.trim() !== "").map((i) => ({ ...i, str: i.str.trim() }));

  // 요일 머리글 「일 월 … 토」 의 자리로 칸 경계를 잡는다
  const heads = WEEKDAYS.map((w) => clean.find((i) => i.str === w));
  if (heads.some((h) => !h)) {
    return { page: pageNo, month: null, elder: "", staffHeader: [], visits: [], warnings: ["달력 요일 머리글을 찾지 못했습니다"] };
  }
  const headY = heads[0]!.y;
  const centers = heads.map((h) => h!.x + 4.5);
  const colW = (centers[6] - centers[0]) / 6;
  const colStart = (c: number) => centers[c] - colW / 2;
  const colOf = (x: number) => {
    const c = Math.floor((x - colStart(0)) / colW);
    return c >= 0 && c < 7 ? c : -1;
  };

  // 위쪽 머리말: 「(2026년 11월) 서비스일정표」, 「김광자 / 2등급 / …」, 「방문직원: 박오임」
  const top = joinLines(clean.filter((i) => i.y > headY + 5 && i.x < colStart(0) + colW * 4));
  let month: string | null = null;
  let elder = "";
  let staffHeader: string[] = [];
  for (const l of top) {
    const m = l.text.match(/\((\d{4})년\s*(\d{1,2})월\)/);
    if (m) month = `${m[1]}-${pad(m[2])}`;
    else if (l.text.startsWith("방문직원")) {
      staffHeader = l.text.replace(/^방문직원\s*:?/, "").trim().split(/[\s,·]+/).filter(Boolean);
    } else if (!elder && l.text.includes("/")) elder = l.text.split("/")[0].trim();
  }
  if (!elder) warnings.push("어르신 성함을 찾지 못했습니다");

  // 날짜 숫자: 칸 왼쪽 위(칸 시작 +20 안쪽)에 있는 1~31
  const body = clean.filter((i) => i.y < headY - 3);
  const timeParts = new Set<TextItem>(); // 시간 조각(「15」「:」…)은 날짜 숫자가 아니다
  for (let k = 0; k < clean.length; k++) {
    const t = readTime(clean, k);
    if (t) for (let q = k; q < t.end; q++) timeParts.add(clean[q]);
  }
  const days = body
    .filter((i) => !timeParts.has(i) && /^\d{1,2}$/.test(i.str) && colOf(i.x) >= 0 && i.x - colStart(colOf(i.x)) < 20)
    .map((i) => ({ day: Number(i.str), col: colOf(i.x), y: i.y }))
    .filter((d) => d.day >= 1 && d.day <= 31);
  const rowYs = [...new Set(days.map((d) => Math.round(d.y)))].sort((a, b) => b - a);

  // 방문 한 건은 글자 순서상 「종류」 → 시간 조각들(「07」「:」「00」「~」…) → 「직원 이름」 으로 이어져 나온다.
  // 자리로는 이름이 칸 왼쪽 끝에 붙어 공휴일 이름과 섞이므로, 순서로 묶고 날짜 칸은 시간 글자 자리로 정한다.
  const dayOf = (x: number, y: number) => {
    const c = colOf(x);
    const row = rowYs.filter((ry) => ry >= y - 4).pop(); // 이 글자보다 위의 가장 가까운 날짜 줄
    if (c < 0 || row === undefined) return null;
    return days.find((d) => d.col === c && Math.round(d.y) === row) ?? null;
  };
  // 칸 오른쪽의 표시(「가족」「인지」)는 같은 칸·같은 높이의 방문에 붙인다
  const marks = body.filter((i) => /^(가족|인지)$/.test(i.str));

  const visits: ParsedVisit[] = [];
  for (let k = 0; k < clean.length; k++) {
    const it = clean[k];
    if (it.y >= headY - 3) continue;
    const t = readTime(clean, k);
    if (!t) continue;
    const { text, m, end: j } = t;
    const day = dayOf(it.x, it.y);
    const prev = clean[k - 1];
    const service = prev && prev.y > it.y + 3 && prev.y - it.y < 25 && !/^\d/.test(prev.str) ? prev.str : "방문";
    const next = clean[j];
    const staff = next && next.y < it.y - 3 && it.y - next.y < 25 && !/^\d/.test(next.str) ? next.str : "";
    k = j; // 직원 이름까지 건너뛴다
    if (!day) {
      warnings.push(`날짜를 알 수 없는 방문(${text})`);
      continue;
    }
    if (!staff) warnings.push(`${day.day}일 ${text} 방문직원 이름이 없습니다`);
    const tags = marks
      .filter((mk) => colOf(mk.x) === day.col && next && Math.abs(mk.y - next.y) <= 3)
      .map((mk) => mk.str);
    visits.push({ day: day.day, start: `${pad(m[1])}:${m[2]}`, end: `${pad(m[3])}:${m[4]}`, service, staff, tags });
  }
  visits.sort((a, b) => a.day - b.day || a.start.localeCompare(b.start));
  if (!visits.length) warnings.push("방문 일정이 없습니다");
  return { page: pageNo, month, elder, staffHeader, visits, warnings };
}

export function parseSchedule(pages: TextItem[][]): ParsedSchedule {
  const out = pages.map((items, i) => parseSchedulePage(items, i + 1));
  const months = [...new Set(out.map((p) => p.month).filter(Boolean))];
  return {
    month: months.length === 1 ? months[0] : null,
    pages: out.map(({ month: _m, ...p }) => p), // eslint-disable-line @typescript-eslint/no-unused-vars
  };
}

/** 관리자 방문처럼 선생님 일정에 보이지 않을 종류 */
export const isCenterVisit = (service: string) => service.includes("관리자");
