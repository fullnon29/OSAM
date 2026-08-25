// 기준표를 읽고, 포털에서 본 것과 견주어 '무엇을 바꿀지'를 정합니다.
//
// 포털을 건드리는 코드는 여기 없습니다. 순수한 계산만 있어 화면 없이도
// 시험할 수 있고, 무엇을 왜 바꾸는지 한곳에서 읽힙니다.
//
// 손대는 범위는 기준표에 적힌 항목뿐입니다. 기준표에 칸이 비어 있으면
// 켜지도 끄지도 않습니다. 근거 없이 기록을 고치지 않기 위해서입니다.

import { readWorkbook } from "./xlsx";

/* ── 기준표의 항목과 포털 항목을 잇는 표 ────────────────────────
   기준표는 여덟 칸으로 줄여 적습니다. 포털의 급여제공기록은 항목이 더
   잘게 나뉘어 있어 아래처럼 이어 줍니다.

   포털 항목 이름이 조금이라도 다르면 이 표만 고치면 됩니다.
   (실제 화면에서 뽑은 이름으로 맞춰 두는 것이 가장 확실합니다.) */

export type ItemKey =
  | "위생"
  | "몸씻기"
  | "식사도움"
  | "체위변경"
  | "이동도움"
  | "화장실"
  | "식사준비"
  | "개인활동";

export const ITEM_TARGETS: Record<ItemKey, string[]> = {
  // 기준표의 '위생' 한 칸이 포털에서는 다섯 항목입니다.
  위생: ["세면도움", "구강관리", "머리감기기", "몸단장", "옷갈아입히기"],
  몸씻기: ["목욕도움"],
  식사도움: ["식사도움"],
  체위변경: ["체위변경"],
  이동도움: ["이동도움"],
  화장실: ["화장실이용하기"],
  식사준비: ["취사"],
  개인활동: ["개인활동지원"],
};

/** 포털에는 있으나 기준표에 칸이 없는 항목들. 손대지 않고 보고서에만 적습니다. */
export const UNMAPPED_ITEMS = [
  "신체기능의유지증진",
  "청소및주변정돈",
  "세탁",
  "일상업무대행",
];

/** 목욕도움이 걸려 있는 포털 항목 이름. 횟수 규칙은 이 항목에만 씁니다. */
export const BATH_ITEM = ITEM_TARGETS.몸씻기[0];

/* ── 기준표 읽기 ───────────────────────────────────────────── */

export type BathRule =
  | { kind: "주"; times: number }
  | { kind: "월"; times: number }
  | { kind: "매일" }
  | { kind: "필요시" }
  | { kind: "없음" }
  | { kind: "모름"; raw: string };

export type Standard = {
  name: string;
  /** 기준표의 줄 번호(1부터). 보고서에서 되짚을 때 씁니다. */
  excelRow: number;
  bath: BathRule;
  /** 기준표 비고란 */
  note: string;
  /** 기준표에 적힌 항목만 담깁니다. 빈 칸은 아예 넣지 않습니다. */
  items: Partial<Record<ItemKey, boolean>>;
  /** 이 기준을 쓸 수 없는 이유. 있으면 손대지 않고 알려만 드립니다. */
  unusable?: string;
};

/** 기준표 제목 줄에 적힌 이름 → 우리가 쓰는 이름 */
const HEADER_TO_ITEM: Record<string, ItemKey> = {
  위생: "위생",
  몸씻기: "몸씻기",
  식사도움: "식사도움",
  체위: "체위변경",
  체위변경: "체위변경",
  이동: "이동도움",
  이동도움: "이동도움",
  화장실: "화장실",
  식사준비: "식사준비",
  개인활동: "개인활동",
};

const tidy = (s: string | undefined) => (s ?? "").replace(/\s+/g, "").trim();

/**
 * 체크 칸을 읽습니다.
 *
 * ☑ 는 켬, ☐ 는 끔, 빈 칸은 '적히지 않음'입니다. 셋을 구별해야 합니다.
 * 빈 칸을 '끔'으로 보면 기준에 없는 항목까지 꺼 버리게 됩니다.
 */
function readCheck(raw: string | undefined): boolean | undefined {
  const v = tidy(raw);
  if (!v) return undefined;
  if (/^(☑|✓|✔|V|O|Y|예|체크|1)$/i.test(v)) return true;
  if (/^(☐|□|X|N|아니오|0|-)$/i.test(v)) return false;
  return undefined;
}

/** 기준표 '몸씻' 칸을 규칙으로 옮깁니다. */
export function parseBathRule(raw: string | undefined): BathRule {
  const v = tidy(raw);
  if (!v) return { kind: "모름", raw: "" };
  if (/^(x|×|없음|안함|해당없음)$/i.test(v)) return { kind: "없음" };
  if (/매일/.test(v)) return { kind: "매일" };
  if (/필요시/.test(v)) return { kind: "필요시" };
  const week = /^주(\d+)/.exec(v);
  if (week) return { kind: "주", times: Number(week[1]) };
  const month = /^월(\d+)/.exec(v);
  if (month) return { kind: "월", times: Number(month[1]) };
  return { kind: "모름", raw: v };
}

/** 규칙을 사람이 읽는 글로 되돌립니다. 보고서에 적습니다. */
export function bathRuleText(rule: BathRule): string {
  switch (rule.kind) {
    case "주":
      return "주 " + rule.times + "회";
    case "월":
      return "월 " + rule.times + "회";
    case "매일":
      return "매일";
    case "필요시":
      return "필요시";
    case "없음":
      return "없음";
    default:
      return rule.raw ? "알 수 없음(" + rule.raw + ")" : "적혀 있지 않음";
  }
}

export type StandardsResult = {
  list: Standard[];
  byName: Map<string, Standard>;
  /** 기준표 자체의 문제. 보고서 '확인 필요' 장에 그대로 옮깁니다. */
  problems: string[];
  sheetName: string;
};

/**
 * 기준표를 읽습니다.
 *
 * 열 자리는 제목 줄의 글자로 찾습니다. 열을 하나 끼워 넣으셔도 어긋나지
 * 않게 하기 위해서입니다.
 */
export async function readStandards(file: string): Promise<StandardsResult> {
  const sheets = await readWorkbook(file);
  if (!sheets.length) throw new Error("기준표에 시트가 없습니다: " + file);

  // 제목 줄이 있는 시트를 찾습니다. 시트가 여럿이어도 헤매지 않습니다.
  let chosen = sheets[0];
  let headerRow = -1;
  for (const sheet of sheets) {
    const at = sheet.rows.findIndex(
      (row) => row.some((c) => tidy(c) === "성명") && row.some((c) => tidy(c) === "몸씻기")
    );
    if (at >= 0) {
      chosen = sheet;
      headerRow = at;
      break;
    }
  }
  if (headerRow < 0) {
    throw new Error(
      "기준표에서 제목 줄을 찾지 못했습니다. '성명' 과 '몸씻기' 가 같은 줄에 있어야 합니다: " + file
    );
  }

  const header = chosen.rows[headerRow];
  const columnOf = (label: string) => header.findIndex((c) => tidy(c) === label);

  const nameCol = columnOf("성명");
  const bathCol = header.findIndex((c) => /^몸씻$/.test(tidy(c)));
  const noteCol = columnOf("비고");

  const itemCols: { key: ItemKey; col: number }[] = [];
  header.forEach((cell, col) => {
    const key = HEADER_TO_ITEM[tidy(cell)];
    // '몸씻'(횟수)과 '몸씻기'(항목)는 다른 칸입니다. 헷갈리지 않게 합니다.
    if (key && col !== bathCol) itemCols.push({ key, col });
  });

  const problems: string[] = [];
  if (bathCol < 0) problems.push("기준표에 '몸씻'(목욕 횟수) 열이 없어 목욕도움은 손대지 않습니다.");
  if (noteCol < 0) problems.push("기준표에 '비고' 열이 없습니다.");
  for (const key of Object.keys(ITEM_TARGETS) as ItemKey[]) {
    if (!itemCols.some((c) => c.key === key)) {
      problems.push("기준표에 '" + key + "' 열이 없어 그 항목은 손대지 않습니다.");
    }
  }

  const list: Standard[] = [];
  for (let r = headerRow + 1; r < chosen.rows.length; r++) {
    const row = chosen.rows[r];
    const name = tidy(row[nameCol]);
    if (!name) continue;

    const items: Partial<Record<ItemKey, boolean>> = {};
    for (const { key, col } of itemCols) {
      const value = readCheck(row[col]);
      if (value !== undefined) items[key] = value;
    }

    const standard: Standard = {
      name,
      excelRow: r + 1,
      bath: bathCol >= 0 ? parseBathRule(row[bathCol]) : { kind: "모름", raw: "" },
      note: (row[noteCol] ?? "").trim(),
      items,
    };

    // 항목 칸이 통째로 비어 있으면 인지활동형처럼 이 표로 다룰 수 없는
    // 분입니다. 억지로 맞추면 엉뚱한 기록이 되므로 알려만 드립니다.
    if (!Object.keys(items).length) {
      standard.unusable = "기준표에 항목 표시가 없습니다(인지활동형 등). 손대지 않습니다.";
    }

    list.push(standard);
  }

  /* 같은 성함이 여러 줄인 경우.
     내용까지 같으면 그냥 중복이니 한 줄로 봅니다. 내용이 다르면 어느 쪽을
     따라야 할지 우리가 알 수 없습니다. 찍어서 고르면 엉뚱한 어르신 기록이
     되므로 손대지 않고 여쭙습니다. */
  const grouped = new Map<string, Standard[]>();
  for (const s of list) {
    const same = grouped.get(s.name) ?? [];
    same.push(s);
    grouped.set(s.name, same);
  }

  const signature = (s: Standard) =>
    JSON.stringify([
      bathRuleText(s.bath),
      (Object.keys(ITEM_TARGETS) as ItemKey[]).map((k) => s.items[k] ?? null),
    ]);

  const byName = new Map<string, Standard>();
  for (const [name, rows] of grouped) {
    const distinct = new Set(rows.map(signature));
    if (rows.length > 1 && distinct.size > 1) {
      const where = rows.map((r) => r.excelRow + "줄").join(", ");
      const reason = "기준표에 '" + name + "' 이(가) 여러 줄(" + where + ") 있고 내용이 서로 다릅니다.";
      for (const r of rows) r.unusable = reason + " 어느 쪽인지 알 수 없어 손대지 않습니다.";
      problems.push(reason);
    } else if (rows.length > 1) {
      problems.push(
        "기준표에 '" + name + "' 이(가) " + rows.length + "줄(" +
          rows.map((r) => r.excelRow + "줄").join(", ") + ") 있습니다. 내용이 같아 첫 줄을 씁니다."
      );
    }
    byName.set(name, rows[0]);
  }

  return { list, byName, problems, sheetName: chosen.name };
}

/* ── 포털에서 본 것 ────────────────────────────────────────── */

export type Observation = {
  /** 목록에서의 줄 번호. 반영할 때 다시 찾아갑니다. */
  index: number;
  /** 수급자 성함 */
  name: string;
  /** 급여제공일 YYYY-MM-DD */
  date: string;
  /** 요양요원 성함 */
  worker: string;
  /** 지금 켜져 있는 항목들. 화면에 있던 항목만 담깁니다. */
  checked: Record<string, boolean>;
  /** 비고란에 적혀 있던 글 */
  note: string;
  /** 상세를 읽지 못했다면 그 까닭 */
  problem?: string;
};

/* ── 무엇을 바꿀지 정하기 ──────────────────────────────────── */

export type Set1 = {
  label: string;
  from: boolean;
  to: boolean;
  /** 왜 바꾸는지. 그대로 보고서에 적습니다. */
  why: string;
  /** 실제 제공 여부와 무관하게 규칙으로 만들어 낸 것인지 */
  generated?: boolean;
};

export type Change = {
  observation: Observation;
  standard?: Standard;
  sets: Set1[];
  /** 비고란에 적을 글. 비어 있을 때만 채웁니다. */
  noteAppend?: string;
  /** 손대지 않지만 알려 드릴 것 */
  warnings: string[];
  /** 반영해 본 결과. 점검 단계에서는 비어 있습니다. */
  applied?: string;
};

export type PlanOptions = {
  /** 기준보다 많이 켜져 있는 목욕도움을 끌지. 기본은 끄지 않습니다. */
  removeExtraBath: boolean;
  /** '필요시' 어르신에게 한 달에 몇 회를 배정할지 */
  asNeededPerMonth: [number, number];
  /** 그때 비고가 비어 있으면 적을 글 */
  asNeededNote: string;
  /** 되풀이해도 같은 날이 나오도록 하는 씨앗 */
  seed: string;
  /** 기준표 비고에 이 말이 있으면 목욕도움은 손대지 않습니다 */
  bathSkipNotes: string[];
};

export const DEFAULT_PLAN_OPTIONS: PlanOptions = {
  removeExtraBath: false,
  asNeededPerMonth: [1, 2],
  asNeededNote: "어르신의 요청으로 목욕도움",
  seed: "osam",
  // 방문목욕 차량으로 목욕하시는 분은 방문요양 기록에 목욕도움을 켜면
  // 안 됩니다. 같은 목욕이 두 번 청구된 것처럼 보이기 때문입니다.
  bathSkipNotes: ["차량목욕"],
};

export type PlanResult = {
  changes: Change[];
  /** 어느 어르신에도 붙지 못한 이야기 */
  problems: string[];
};

/* 되풀이해도 같은 답이 나오는 난수.
   실행할 때마다 다른 날이 뽑히면, 어제 만든 보고서와 오늘 만든 보고서가
   달라져 무엇이 맞는지 알 수 없게 됩니다. */

function hashSeed(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function makeRng(text: string): () => number {
  let a = hashSeed(text);
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 날짜를 YYYY-MM-DD 로 적습니다.
 *
 * toISOString() 을 쓰면 안 됩니다. 그것은 세계 표준시로 바꿔 적기 때문에
 * 우리 시각으로 8월 3일 0시가 8월 2일로 적힙니다. 주가 하루씩 밀립니다.
 */
function ymd(d: Date): string {
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return d.getFullYear() + "-" + month + "-" + day;
}

/** 월요일부터 세는 그 주의 첫날. 주 단위 묶음의 이름으로 씁니다. */
function weekKey(date: string): string {
  const d = new Date(date + "T00:00:00");
  if (Number.isNaN(d.getTime())) return date;
  const dow = (d.getDay() + 6) % 7; // 월요일 = 0
  d.setDate(d.getDate() - dow);
  return ymd(d) + "주";
}

const monthKey = (date: string) => date.slice(0, 7);

/**
 * 후보 가운데 need 개를 고릅니다.
 *
 * 규칙적인 횟수(주2회 등)는 고르게 퍼뜨립니다. 이틀 내리 목욕하고 나머지
 * 닷새를 비우는 것보다 실제와 가깝기 때문입니다.
 * '필요시'는 정해진 날이 없으므로 씨앗 난수로 뽑되, 되풀이해도 같습니다.
 */
function chooseVisits(candidates: number[], need: number, rng: () => number, spread: boolean): number[] {
  if (need <= 0) return [];
  if (need >= candidates.length) return candidates.slice();

  if (spread) {
    const picked: number[] = [];
    for (let k = 0; k < need; k++) {
      const at = Math.min(candidates.length - 1, Math.floor(((k + 0.5) * candidates.length) / need));
      // 같은 자리가 두 번 뽑히면 빈자리를 찾아 옮깁니다. 뒤를 먼저 보고,
      // 뒤가 다 찼으면 앞을 봅니다. 모자란 채로 끝나지 않게 하기 위해서입니다.
      let step = candidates.findIndex((c, i) => i >= at && !picked.includes(c));
      if (step < 0) step = candidates.findIndex((c) => !picked.includes(c));
      if (step < 0) break;
      picked.push(candidates[step]);
    }
    return picked.sort((a, b) => a - b);
  }

  const pool = candidates.slice();
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, need).sort((a, b) => a - b);
}

/**
 * 목욕도움을 어느 날에 켤지 정합니다.
 *
 * 이미 켜져 있는 날을 먼저 셈에 넣습니다. 요양요원이 실제로 적어 둔 것을
 * 우리가 지우고 다른 날로 옮기는 일이 없도록 하기 위해서입니다.
 */
function planBath(
  visits: Observation[],
  standard: Standard,
  options: PlanOptions
): { on: Set<number>; generated: Set<number>; quotaText: string } {
  // on 에 들지 않은 날에 목욕이 켜져 있으면 '기준보다 많다'는 뜻입니다.
  // 그 처리는 바깥(plan)에서 한곳으로 모아 합니다.
  const on = new Set<number>();
  const generated = new Set<number>();
  const rule = standard.bath;

  // '없음'이면 기준상 목욕이 없는 분이라 아무 날도 켜지 않습니다.
  if (rule.kind === "모름" || rule.kind === "없음") {
    return { on, generated, quotaText: bathRuleText(rule) };
  }

  if (rule.kind === "매일") {
    for (const v of visits) on.add(v.index);
    return { on, generated, quotaText: "매일" };
  }

  // 주 단위인지 달 단위인지에 따라 묶는 기준이 다릅니다.
  const bucketOf = rule.kind === "주" ? weekKey : monthKey;
  const buckets = new Map<string, Observation[]>();
  for (const v of visits) {
    const key = bucketOf(v.date);
    const same = buckets.get(key) ?? [];
    same.push(v);
    buckets.set(key, same);
  }

  const quotas: string[] = [];
  for (const [key, bucket] of [...buckets].sort(([a], [b]) => (a < b ? -1 : 1))) {
    bucket.sort((a, b) => (a.date < b.date ? -1 : 1));

    const rng = makeRng(options.seed + "|" + standard.name + "|" + key);
    let quota: number;
    if (rule.kind === "필요시") {
      const [min, max] = options.asNeededPerMonth;
      quota = min + Math.floor(rng() * (Math.max(min, max) - min + 1));
    } else {
      quota = rule.times;
    }
    quotas.push(key + " " + quota + "회");

    // 이미 켜져 있는 날을 먼저 셈에 넣습니다. 기준을 넘는 몫은 넣지 않아,
    // 바깥에서 '기준보다 많다'고 알아볼 수 있게 둡니다.
    const already = bucket.filter((v) => v.checked[BATH_ITEM]);
    for (const v of already.slice(0, quota)) on.add(v.index);

    // 이미 기준만큼(또는 그 이상) 있으면 더 켜지 않습니다.
    if (already.length >= quota) continue;

    const candidates = bucket.filter((v) => !v.checked[BATH_ITEM]).map((v) => v.index);
    const picked = chooseVisits(candidates, quota - already.length, rng, rule.kind !== "필요시");
    for (const index of picked) {
      on.add(index);
      // 규칙만 보고 만들어 낸 날입니다. 보고서에서 따로 표시합니다.
      generated.add(index);
    }
  }

  return { on, generated, quotaText: bathRuleText(rule) + " (" + quotas.join(" · ") + ")" };
}

/** 포털에서 본 것과 기준표를 견주어 바꿀 목록을 만듭니다. */
export function plan(
  standards: StandardsResult,
  observations: Observation[],
  options: PlanOptions = DEFAULT_PLAN_OPTIONS
): PlanResult {
  const problems: string[] = [];
  const changes = new Map<number, Change>();

  const changeFor = (obs: Observation, standard?: Standard): Change => {
    let existing = changes.get(obs.index);
    if (!existing) {
      existing = { observation: obs, standard, sets: [], warnings: [] };
      changes.set(obs.index, existing);
    }
    return existing;
  };

  // 어르신별로 묶습니다. 목욕 횟수는 하루만 보고는 정할 수 없기 때문입니다.
  const byPerson = new Map<string, Observation[]>();
  for (const obs of observations) {
    const same = byPerson.get(obs.name) ?? [];
    same.push(obs);
    byPerson.set(obs.name, same);
  }

  for (const [name, visits] of byPerson) {
    visits.sort((a, b) => (a.date < b.date ? -1 : 1));

    const readable = visits.filter((v) => !v.problem);
    for (const v of visits) {
      if (v.problem) changeFor(v).warnings.push("상세를 읽지 못했습니다: " + v.problem);
    }
    if (!readable.length) continue;

    const standard = standards.byName.get(name);
    if (!standard) {
      problems.push(
        name + " — 기준표에 없는 성함입니다 (" + visits.length + "건). 손대지 않았습니다."
      );
      for (const v of readable) changeFor(v).warnings.push("기준표에 없는 성함입니다.");
      continue;
    }
    if (standard.unusable) {
      problems.push(name + " — " + standard.unusable + " (" + visits.length + "건)");
      for (const v of readable) changeFor(v, standard).warnings.push(standard.unusable);
      continue;
    }

    /* 1) 목욕도움 말고 나머지 항목. 방문할 때마다 기준과 같아야 합니다. */
    for (const obs of readable) {
      const change = changeFor(obs, standard);
      for (const key of Object.keys(ITEM_TARGETS) as ItemKey[]) {
        if (key === "몸씻기") continue; // 목욕은 아래에서 따로 셈합니다
        const desired = standard.items[key];
        if (desired === undefined) continue; // 기준표가 비어 있으면 손대지 않습니다

        for (const label of ITEM_TARGETS[key]) {
          const current = obs.checked[label];
          if (current === undefined) {
            change.warnings.push("화면에서 '" + label + "' 항목을 찾지 못했습니다.");
            continue;
          }
          if (current === desired) continue;
          change.sets.push({
            label,
            from: current,
            to: desired,
            why: "기준표 " + standard.excelRow + "줄 '" + key + "' = " + (desired ? "체크" : "해제"),
          });
        }
      }
    }

    /* 2) 목욕도움. 기준표 비고에 차량목욕이라 적혀 있으면 손대지 않습니다. */
    const skipReason = options.bathSkipNotes.find((word) => standard.note.includes(word));
    if (skipReason) {
      for (const obs of readable) {
        changeFor(obs, standard).warnings.push(
          "기준표 비고가 '" + standard.note + "' 이라 목욕도움은 손대지 않았습니다."
        );
      }
      continue;
    }
    if (standard.bath.kind === "모름") {
      for (const obs of readable) {
        changeFor(obs, standard).warnings.push(
          "기준표 '몸씻' 칸이 " + bathRuleText(standard.bath) + " 이라 목욕도움은 손대지 않았습니다."
        );
      }
      continue;
    }

    const bath = planBath(readable, standard, options);
    for (const obs of readable) {
      const change = changeFor(obs, standard);
      const current = obs.checked[BATH_ITEM];
      if (current === undefined) {
        change.warnings.push("화면에서 '" + BATH_ITEM + "' 항목을 찾지 못했습니다.");
        continue;
      }

      const wanted = bath.on.has(obs.index);
      const madeUp = bath.generated.has(obs.index);

      if (wanted && !current) {
        change.sets.push({
          label: BATH_ITEM,
          from: false,
          to: true,
          why:
            "기준표 " + standard.excelRow + "줄 몸씻 " + bath.quotaText +
            (madeUp ? " — 규칙에 따라 이 날로 배정" : ""),
          generated: madeUp,
        });
        // '필요시'로 새로 켠 날은 비고가 비어 있을 때만 까닭을 남깁니다.
        if (madeUp && standard.bath.kind === "필요시" && !obs.note.trim()) {
          change.noteAppend = options.asNeededNote;
        }
      } else if (!wanted && current) {
        // 기준보다 많습니다. 기본은 알려만 드립니다. 요양요원이 실제로
        // 해 드린 목욕을 우리가 지우면 그편이 더 큰 잘못이기 때문입니다.
        if (options.removeExtraBath) {
          change.sets.push({
            label: BATH_ITEM,
            from: true,
            to: false,
            why: "기준표 " + standard.excelRow + "줄 몸씻 " + bath.quotaText + " 을(를) 넘습니다",
          });
        } else {
          change.warnings.push(
            "목욕도움이 기준(" + bathRuleText(standard.bath) + ")보다 많습니다. 끄지 않았습니다."
          );
        }
      }
    }
  }

  const list = [...changes.values()].sort((a, b) => a.observation.index - b.observation.index);
  return { changes: list, problems };
}
