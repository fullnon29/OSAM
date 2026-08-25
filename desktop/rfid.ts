// RFID 전송내역을 기준표와 맞춰 보고, 승인하시면 반영합니다.
//
// 두 걸음으로 나눴습니다.
//   1) 점검 — 조회해서 지금 어떻게 되어 있는지 읽고, 무엇을 바꿀지 엑셀로 냅니다.
//              이때 포털에는 아무것도 쓰지 않습니다.
//   2) 반영 — 그 엑셀을 보시고 승인하시면 그대로 고쳐 저장합니다.
//
// 나눈 까닭은 되돌리기 어렵기 때문입니다. 163분 곱하기 한 달치를 한 번에
// 잘못 고치면 손으로 되돌릴 수 없습니다. 먼저 종이로 보시고 결정하십시오.

import path from "node:path";
import { runStep } from "./portal";
import {
  DEFAULT_PLAN_OPTIONS,
  ITEM_TARGETS,
  UNMAPPED_ITEMS,
  plan,
  readStandards,
  type Change,
  type Observation,
  type PlanOptions,
  type StandardsResult,
} from "./rfid-plan";
import {
  STEP_RFID_CLOSE,
  STEP_RFID_LIST,
  STEP_RFID_PROBE,
  STEP_RFID_SAVE,
  stepApplyDetail,
  stepOpenDetail,
  stepReadDetail,
  stepSearch,
} from "./rfid-steps";
import { stamp, writeReport } from "./rfid-report";

export type RfidLog = { kind: "info" | "ok" | "warn" | "error"; text: string };

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 화면에서 찾아야 할 항목 이름 전부. */
const ALL_ITEM_LABELS = [...new Set([...Object.values(ITEM_TARGETS).flat(), ...UNMAPPED_ITEMS])];

let stopRequested = false;
export function requestRfidStop(): void {
  stopRequested = true;
}

/** 날짜를 YYYYMMDD 로. 포털 날짜칸이 쓰는 모양입니다. */
const compact = (isoDate: string) => isoDate.replace(/-/g, "");

/* ── 살펴보기 ──────────────────────────────────────────────── */

/**
 * RFID 화면에 무엇이 있는지 파일로 남깁니다.
 *
 * 자동화가 어긋나면 여기부터 보십시오. 항목 이름이 우리가 아는 것과
 * 다르면 rfid-plan.ts 의 ITEM_TARGETS 만 고치면 됩니다.
 */
export async function probeRfid(saveDir: string): Promise<{ saved: string | null; summary: string }> {
  const result = await runStep(STEP_RFID_PROBE);
  if (!result.ok) return { saved: null, summary: String(result.reason ?? "살펴보지 못했습니다.") };

  const target = path.join(saveDir, "RFID화면구조-" + stamp() + ".json");
  await writeJson(target, result);

  const boxes = (result.checkboxes as { label: string }[]) ?? [];
  const datasets = (result.datasets as { name: string; rows: number }[]) ?? [];
  const known = boxes.filter((b) =>
    ALL_ITEM_LABELS.some((l) => l.replace(/\s/g, "") === String(b.label).replace(/\s/g, ""))
  );
  return {
    saved: target,
    summary:
      "자료 묶음 " + datasets.length + "개 · 체크 칸 " + boxes.length + "개" +
      " (그중 우리가 아는 항목 " + known.length + "/" + ALL_ITEM_LABELS.length + "개)",
  };
}

async function writeJson(file: string, value: unknown): Promise<void> {
  const { writeFile } = await import("node:fs/promises");
  await writeFile(file, JSON.stringify(value, null, 1), "utf8");
}

/**
 * 보고서를 냅니다.
 *
 * 저장하지 못하더라도 하던 일은 계속합니다. 보고서가 없다고 이미 읽은
 * 것을 버릴 까닭은 없기 때문입니다.
 */
async function saveReport(
  survey: Survey,
  phase: "점검" | "반영",
  onLog: (log: RfidLog) => void
): Promise<string | null> {
  try {
    return await writeReport({
      phase,
      from: survey.options.from,
      to: survey.options.to,
      referenceFile: survey.options.referenceFile,
      saveDir: survey.options.saveDir,
      standards: survey.standards,
      observations: survey.observations,
      changes: survey.changes,
      problems: survey.problems,
      planOptions: survey.planOptions,
    });
  } catch (err) {
    onLog({
      kind: "error",
      text: "보고서를 저장하지 못했습니다: " + (err instanceof Error ? err.message : String(err)),
    });
    return null;
  }
}

/* ── 1) 점검 ───────────────────────────────────────────────── */

export type SurveyOptions = {
  /** 기준표 엑셀 파일 */
  referenceFile: string;
  /** 급여제공일 시작·끝 (YYYY-MM-DD) */
  from: string;
  to: string;
  /** 보고서를 둘 폴더 */
  saveDir: string;
  /** 한 줄만 읽어 보고 멈춥니다. 처음 쓰실 때 확인용입니다. */
  onlyOne: boolean;
  planOptions?: Partial<PlanOptions>;
};

export type Survey = {
  options: SurveyOptions;
  planOptions: PlanOptions;
  standards: StandardsResult;
  observations: Observation[];
  changes: Change[];
  problems: string[];
  /** 목록을 담고 있던 자료 묶음 이름. 반영할 때 같은 것을 씁니다. */
  datasetName: string;
  reportFile: string | null;
};

/** 마지막 점검 결과. 반영은 이것을 근거로만 합니다. */
let lastSurvey: Survey | null = null;
export function getLastSurvey(): Survey | null {
  return lastSurvey;
}

export type SurveyResult = {
  rows: number;
  read: number;
  unreadable: number;
  changeRows: number;
  changeItems: number;
  generated: number;
  reportFile: string | null;
  stopped: boolean;
};

/**
 * 조회한 뒤 줄마다 상세를 열어 지금 상태를 읽습니다. 포털에는 쓰지 않습니다.
 */
export async function surveyRfid(
  options: SurveyOptions,
  onLog: (log: RfidLog) => void
): Promise<SurveyResult> {
  stopRequested = false;
  const planOptions: PlanOptions = { ...DEFAULT_PLAN_OPTIONS, ...(options.planOptions ?? {}) };
  const empty: SurveyResult = {
    rows: 0, read: 0, unreadable: 0, changeRows: 0,
    changeItems: 0, generated: 0, reportFile: null, stopped: false,
  };

  onLog({ kind: "info", text: "기준표를 읽습니다: " + options.referenceFile });
  const standards = await readStandards(options.referenceFile);
  onLog({ kind: "info", text: "기준표 " + standards.list.length + "명 (" + standards.sheetName + ")" });
  for (const problem of standards.problems) onLog({ kind: "warn", text: "기준표 — " + problem });

  onLog({ kind: "info", text: "급여제공일 " + options.from + " ~ " + options.to + " 을 조회합니다." });
  const searched = await runStep(stepSearch(compact(options.from), compact(options.to)));
  for (const alert of (searched.alerts as string[]) ?? []) onLog({ kind: "warn", text: "포털 알림 — " + alert });
  if (!searched.ok) {
    onLog({ kind: "error", text: String(searched.reason) });
    return empty;
  }
  if (Number(searched.dateFields ?? 0) < 2) {
    onLog({
      kind: "warn",
      text: "화면에 날짜칸이 하나뿐이라 시작일(" + options.from + ")만 넣었습니다. 하루씩만 조회되는 화면입니다.",
    });
  }
  // 조회는 서버를 다녀옵니다. 결과가 들어차기를 기다립니다.
  await wait(1500);

  const listed = await runStep(STEP_RFID_LIST);
  if (!listed.ok) {
    onLog({ kind: "error", text: String(listed.reason) });
    for (const c of (listed.candidates as unknown[]) ?? []) {
      onLog({ kind: "info", text: "  본 자료 묶음: " + JSON.stringify(c) });
    }
    return empty;
  }

  const datasetName = String(listed.dataset);
  const rows = (listed.rows as { i: number; name: string; date: string; worker: string }[]) ?? [];
  onLog({
    kind: "info",
    text: "전송내역 " + rows.length + "건을 찾았습니다 (자료 묶음 " + datasetName + ").",
  });
  if (!rows.length) return empty;

  const observations: Observation[] = [];
  let unreadable = 0;
  let consecutiveFailures = 0;

  for (const row of rows) {
    if (stopRequested) {
      onLog({ kind: "warn", text: "중지했습니다." });
      break;
    }

    const observation: Observation = {
      index: row.i, name: row.name, date: row.date, worker: row.worker, checked: {}, note: "",
    };

    const opened = await runStep(stepOpenDetail(datasetName, row.i));
    if (!opened.ok) {
      observation.problem = "상세를 열지 못했습니다: " + opened.reason;
      observations.push(observation);
      unreadable++;
      consecutiveFailures++;
      onLog({ kind: "error", text: row.name + " " + row.date + " — " + observation.problem });
      if (consecutiveFailures >= 3) {
        onLog({
          kind: "error",
          text: "같은 이유로 3번 잇달아 실패해 멈춥니다. 포털 화면이 닫혔거나 로그인이 풀렸는지 확인해 주십시오.",
        });
        break;
      }
      if (options.onlyOne) break;
      continue;
    }

    // 창은 곧바로 뜨지만 내용은 서버에서 따로 받아 옵니다. 채워지기 전에
    // 읽으면 전부 꺼져 있는 것으로 보여, 멀쩡한 기록을 고치려 들게 됩니다.
    let detail = await runStep(stepReadDetail(ALL_ITEM_LABELS));
    for (let tries = 0; tries < 12 && !detail.ok; tries++) {
      await wait(400);
      detail = await runStep(stepReadDetail(ALL_ITEM_LABELS));
    }

    if (!detail.ok) {
      observation.problem = String(detail.reason ?? "상세를 읽지 못했습니다.");
      unreadable++;
      consecutiveFailures++;
      onLog({ kind: "error", text: row.name + " " + row.date + " — " + observation.problem });
      const seen = (detail.seen as string[]) ?? [];
      if (seen.length) onLog({ kind: "info", text: "  화면에 있던 체크 칸: " + seen.join(", ") });
    } else {
      consecutiveFailures = 0;
      observation.checked = (detail.checked as Record<string, boolean>) ?? {};
      observation.note = String(detail.note ?? "");
      const missing = (detail.missing as string[]) ?? [];
      if (missing.length) {
        onLog({
          kind: "warn",
          text: row.name + " " + row.date + " — 화면에 없는 항목: " + missing.join(", "),
        });
      }
    }
    observations.push(observation);

    await runStep(STEP_RFID_CLOSE);
    await wait(250);

    if (observations.length % 20 === 0) {
      onLog({ kind: "info", text: observations.length + "/" + rows.length + " 읽었습니다." });
    }
    if (options.onlyOne) {
      onLog({ kind: "info", text: "한 줄만 읽어 보았습니다. 결과를 확인해 주십시오." });
      break;
    }
  }

  const planned = plan(standards, observations, planOptions);
  for (const problem of planned.problems) onLog({ kind: "warn", text: problem });

  const changeRows = planned.changes.filter((c) => c.sets.length || c.noteAppend);
  const changeItems = changeRows.reduce((n, c) => n + c.sets.length, 0);
  const generated = changeRows.reduce((n, c) => n + c.sets.filter((s) => s.generated).length, 0);

  const survey: Survey = {
    options, planOptions, standards, observations,
    changes: planned.changes, problems: planned.problems,
    datasetName, reportFile: null,
  };

  survey.reportFile = await saveReport(survey, "점검", onLog);
  lastSurvey = survey;

  onLog({
    kind: "ok",
    text:
      "점검 끝 — 읽음 " + (observations.length - unreadable) + "건 · 못 읽음 " + unreadable +
      "건 · 고칠 줄 " + changeRows.length + "건 (항목 " + changeItems + "개, 그중 자동생성 " + generated + "개)",
  });
  if (survey.reportFile) onLog({ kind: "info", text: "보고서: " + survey.reportFile });

  return {
    rows: rows.length,
    read: observations.length - unreadable,
    unreadable,
    changeRows: changeRows.length,
    changeItems,
    generated,
    reportFile: survey.reportFile,
    stopped: stopRequested,
  };
}

/* ── 2) 반영 ───────────────────────────────────────────────── */

export type ApplyResult = {
  rows: number;
  saved: number;
  failed: number;
  skipped: number;
  reportFile: string | null;
  stopped: boolean;
};

/**
 * 점검에서 나온 목록을 그대로 포털에 반영합니다.
 *
 * 줄 번호만 믿지 않습니다. 그 사이에 다시 조회하셨으면 번호가 밀려 엉뚱한
 * 어르신 기록을 고치게 되기 때문입니다. 성함과 급여제공일이 점검할 때와
 * 같은지 확인하고, 다르면 그 줄은 건너뜁니다.
 */
export async function applyRfid(onLog: (log: RfidLog) => void): Promise<ApplyResult> {
  stopRequested = false;
  const survey = lastSurvey;
  const empty: ApplyResult = { rows: 0, saved: 0, failed: 0, skipped: 0, reportFile: null, stopped: false };

  if (!survey) {
    onLog({ kind: "error", text: "먼저 점검을 해 주십시오. 반영은 점검 결과가 있어야 합니다." });
    return empty;
  }

  const todo = survey.changes.filter((c) => c.sets.length || c.noteAppend);
  if (!todo.length) {
    onLog({ kind: "info", text: "고칠 것이 없습니다." });
    return empty;
  }

  // 지금 화면의 목록이 점검 때와 같은지 봅니다.
  const listed = await runStep(STEP_RFID_LIST);
  if (!listed.ok) {
    onLog({ kind: "error", text: "목록을 다시 읽지 못했습니다: " + listed.reason });
    return empty;
  }
  const current = new Map<number, { name: string; date: string }>();
  for (const row of (listed.rows as { i: number; name: string; date: string }[]) ?? []) {
    current.set(row.i, { name: row.name, date: row.date });
  }

  onLog({ kind: "info", text: "고칠 줄 " + todo.length + "건을 반영합니다." });

  let saved = 0;
  let failed = 0;
  let skipped = 0;

  for (const change of todo) {
    if (stopRequested) {
      onLog({ kind: "warn", text: "중지했습니다." });
      break;
    }

    const obs = change.observation;
    const who = obs.name + " " + obs.date;
    const at = current.get(obs.index);
    if (!at || at.name !== obs.name || at.date !== obs.date) {
      change.applied = "건너뜀 — 목록이 점검할 때와 다릅니다. 다시 점검해 주십시오.";
      skipped++;
      onLog({ kind: "warn", text: who + " — " + change.applied });
      continue;
    }

    const opened = await runStep(stepOpenDetail(survey.datasetName, obs.index));
    if (!opened.ok) {
      change.applied = "실패 — 상세를 열지 못했습니다: " + opened.reason;
      failed++;
      onLog({ kind: "error", text: who + " — " + change.applied });
      continue;
    }

    // 열린 창이 정말 그 줄인지, 그리고 우리가 점검할 때 본 것과 같은지
    // 다시 읽습니다. 그 사이에 누가 고쳤으면 덮어쓰지 않습니다.
    let detail = await runStep(stepReadDetail(ALL_ITEM_LABELS));
    for (let tries = 0; tries < 12 && !detail.ok; tries++) {
      await wait(400);
      detail = await runStep(stepReadDetail(ALL_ITEM_LABELS));
    }
    if (!detail.ok) {
      change.applied = "실패 — 상세를 읽지 못했습니다: " + detail.reason;
      failed++;
      onLog({ kind: "error", text: who + " — " + change.applied });
      await runStep(STEP_RFID_CLOSE);
      continue;
    }

    const nowChecked = (detail.checked as Record<string, boolean>) ?? {};
    const moved = change.sets.filter((s) => nowChecked[s.label] !== s.from);
    if (moved.length) {
      change.applied =
        "건너뜀 — 점검 뒤에 바뀐 항목이 있습니다 (" + moved.map((s) => s.label).join(", ") + ")";
      skipped++;
      onLog({ kind: "warn", text: who + " — " + change.applied });
      await runStep(STEP_RFID_CLOSE);
      continue;
    }

    const applied = await runStep(
      stepApplyDetail(change.sets.map((s) => ({ label: s.label, to: s.to })), change.noteAppend)
    );
    for (const alert of (applied.alerts as string[]) ?? []) onLog({ kind: "warn", text: "포털 알림 — " + alert });

    if (!applied.ok) {
      const why = ((applied.failed as { label: string; reason: string }[]) ?? [])
        .map((f) => f.label + "(" + f.reason + ")")
        .join(", ");
      change.applied = "실패 — 고치지 못했습니다: " + why;
      failed++;
      onLog({ kind: "error", text: who + " — " + change.applied });
      // 반쯤 고친 채로 저장하지 않습니다. 그냥 닫고 나옵니다.
      await runStep(STEP_RFID_CLOSE);
      continue;
    }

    const stored = await runStep(STEP_RFID_SAVE);
    for (const alert of (stored.alerts as string[]) ?? []) onLog({ kind: "warn", text: "포털 알림 — " + alert });
    if (!stored.ok) {
      change.applied = "실패 — 저장하지 못했습니다: " + stored.reason;
      failed++;
      onLog({ kind: "error", text: who + " — " + change.applied });
      await runStep(STEP_RFID_CLOSE);
      continue;
    }

    change.applied = "반영함";
    saved++;
    onLog({ kind: "ok", text: who + " — 항목 " + change.sets.length + "개 반영" });

    await wait(500);
    await runStep(STEP_RFID_CLOSE);
    await wait(250);
  }

  const reportFile = await saveReport(survey, "반영", onLog);
  onLog({
    kind: "ok",
    text: "반영 끝 — 저장 " + saved + "건 · 건너뜀 " + skipped + "건 · 실패 " + failed + "건",
  });
  if (reportFile) onLog({ kind: "info", text: "보고서: " + reportFile });

  return { rows: todo.length, saved, failed, skipped, reportFile, stopped: stopRequested };
}
