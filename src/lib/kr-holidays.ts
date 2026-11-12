// 한국 공휴일(대체공휴일 포함)과 「쉬는 날 전 마지막 근무일」 계산 — 평가 길잡이 앱의 주말·휴일 안내용.
//
// 음력 공휴일(설·추석·부처님오신날)과 선거일은 해마다 표로 넣어야 합니다(아래 LUNAR / ELECTIONS).
// 임시공휴일은 미리 알 수 없으므로 DB 표 guide_holidays 에 날짜를 넣으면 반영됩니다(extra 인자).
// 표에 없는 해는 음력 공휴일이 빠지므로 coverage() 로 확인해 알립니다.

/** 음력 공휴일: [설날 당일, 추석 당일, 부처님오신날] */
const LUNAR: Record<number, [string, string, string]> = {
  2026: ["2026-02-17", "2026-09-25", "2026-05-24"],
  2027: ["2027-02-07", "2027-09-15", "2027-05-13"],
  2028: ["2028-01-27", "2028-10-03", "2028-05-02"],
};
/** 공직선거일(공휴일) */
const ELECTIONS: string[] = ["2026-06-03", "2028-04-12"];

export const COVERED_YEARS = Object.keys(LUNAR).map(Number);

const iso = (d: Date) => d.toISOString().slice(0, 10);
const parse = (s: string) => new Date(s + "T00:00:00Z");
const addDays = (s: string, n: number) => iso(new Date(parse(s).getTime() + n * 86400000));
const dow = (s: string) => parse(s).getUTCDay(); // 0 일 … 6 토

type Base = { date: string; name: string; sub: "none" | "sunday" | "weekend" };

function baseHolidays(year: number): Base[] {
  const y = String(year);
  const out: Base[] = [
    { date: `${y}-01-01`, name: "신정", sub: "none" },
    { date: `${y}-03-01`, name: "삼일절", sub: "weekend" },
    { date: `${y}-05-05`, name: "어린이날", sub: "weekend" },
    { date: `${y}-06-06`, name: "현충일", sub: "none" },
    { date: `${y}-08-15`, name: "광복절", sub: "weekend" },
    { date: `${y}-10-03`, name: "개천절", sub: "weekend" },
    { date: `${y}-10-09`, name: "한글날", sub: "weekend" },
    { date: `${y}-12-25`, name: "성탄절", sub: "weekend" },
  ];
  const l = LUNAR[year];
  if (l) {
    for (const d of [addDays(l[0], -1), l[0], addDays(l[0], 1)]) out.push({ date: d, name: "설날 연휴", sub: "sunday" });
    for (const d of [addDays(l[1], -1), l[1], addDays(l[1], 1)]) out.push({ date: d, name: "추석 연휴", sub: "sunday" });
    out.push({ date: l[2], name: "부처님오신날", sub: "weekend" });
  }
  for (const e of ELECTIONS) if (e.startsWith(y)) out.push({ date: e, name: "선거일", sub: "none" });
  return out;
}

/** year 의 공휴일 날짜 집합(대체공휴일 포함). 설·추석 연휴는 일요일과 겹치면, 나머지는 토·일과 겹치면 다음 평일을 대체로 쉽니다. */
export function holidaysOf(year: number): Set<string> {
  const base = baseHolidays(year).sort((a, b) => a.date.localeCompare(b.date));
  const set = new Set(base.map((b) => b.date));
  // 같은 이름의 연휴(설·추석)는 묶어서 대체를 한 번만 계산한다
  const groups = new Map<string, Base[]>();
  for (const b of base) {
    const k = b.name.endsWith("연휴") ? b.name : b.date;
    groups.set(k, [...(groups.get(k) ?? []), b]);
  }
  const lastOf = (g: Base[]) => g[g.length - 1].date;
  const hit = (g: Base[]) =>
    g.some((b) => (b.sub === "sunday" ? dow(b.date) === 0 : b.sub === "weekend" ? dow(b.date) === 0 || dow(b.date) === 6 : false));
  const needs = [...groups.values()].filter(hit).sort((a, b) => a[0].date.localeCompare(b[0].date));
  for (const g of needs) {
    let d = addDays(lastOf(g), 1);
    while (dow(d) === 0 || dow(d) === 6 || set.has(d)) d = addDays(d, 1);
    set.add(d);
  }
  return set;
}

export function isOffDay(date: string, extra?: Set<string>): boolean {
  const w = dow(date);
  if (w === 0 || w === 6) return true;
  if (extra?.has(date)) return true;
  return holidaysOf(Number(date.slice(0, 4))).has(date);
}

/**
 * today(YYYY-MM-DD)가 「쉬는 날 전 마지막 근무일」이면 이어지는 쉬는 날들을 돌려줍니다(아니면 null).
 * 근무일 = 주말·공휴일이 아닌 날. 예) 평소 금요일 → [토, 일], 월요일이 공휴일이면 → [토, 일, 월].
 */
export function alertWindow(today: string, extra?: Set<string>): string[] | null {
  if (isOffDay(today, extra)) return null;
  const next = addDays(today, 1);
  if (!isOffDay(next, extra)) return null;
  const off: string[] = [];
  for (let d = next; isOffDay(d, extra) && off.length < 15; d = addDays(d, 1)) off.push(d);
  return off;
}

/** 음력 공휴일 표가 없는 해(설·추석이 빠져 있어 알림이 어긋날 수 있음)인지 */
export function coverage(year: number): boolean {
  return year in LUNAR;
}

export const weekdayKo = (date: string) => ["일", "월", "화", "수", "목", "금", "토"][dow(date)];

/** "11/14(토)" */
export const shortDateKo = (date: string) => `${date.slice(5, 7)}/${date.slice(8, 10)}(${weekdayKo(date)})`;
