// 언제·누구를·무엇을 했는지 엑셀로 냅니다.
//
// 점검할 때와 반영한 뒤에 각각 한 장씩 나옵니다. 매월·매주 남겨 두시면
// 나중에 무엇을 근거로 고쳤는지 되짚을 수 있습니다.
//
// 포털을 건드리는 코드는 여기 없습니다. 그래야 화면 없이도 보고서 모양을
// 확인할 수 있습니다.

import path from "node:path";
import {
  BATH_ITEM,
  UNMAPPED_ITEMS,
  type Change,
  type Observation,
  type PlanOptions,
  type StandardsResult,
} from "./rfid-plan";
import { writeWorkbook, type Cell } from "./xlsx";

export type ReportInput = {
  /** "점검" 이면 아직 포털에 쓰지 않은 것, "반영" 이면 쓴 뒤의 결과입니다. */
  phase: "점검" | "반영";
  from: string;
  to: string;
  referenceFile: string;
  saveDir: string;
  standards: StandardsResult;
  observations: Observation[];
  changes: Change[];
  problems: string[];
  planOptions: PlanOptions;
};

const yesNo = (on: boolean) => (on ? "체크" : "해제");

/**
 * 파일 이름에 붙일 시각. 우리 시각으로 적습니다.
 *
 * toISOString() 을 쓰면 세계 표준시로 적혀, 오전에 만든 파일이 전날
 * 이름을 달고 나옵니다. 어느 것이 방금 만든 것인지 알 수 없게 됩니다.
 */
export function stamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) +
    "-" + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds())
  );
}

/** 보고서를 저장하고 그 자리를 돌려줍니다. */
export async function writeReport(input: ReportInput): Promise<string> {
  const at = new Date().toLocaleString("ko-KR");
  const { phase } = input;

  const work: Cell[][] = [
    ["작업일시", "구분", "급여제공일", "어르신", "요양요원", "항목", "이전", "이후", "사유", "자동생성", "반영결과"],
  ];
  const attention: Cell[][] = [["구분", "어르신", "급여제공일", "내용"]];

  for (const problem of input.standards.problems) attention.push(["기준표", "", "", problem]);
  for (const problem of input.problems) attention.push(["대조", "", "", problem]);

  let items = 0;
  let generated = 0;
  const touched = new Set<string>();
  const pending = phase === "점검" ? "아직 반영하지 않음" : "";

  for (const change of input.changes) {
    const obs = change.observation;

    for (const set of change.sets) {
      items++;
      if (set.generated) generated++;
      touched.add(obs.name);
      work.push([
        at, phase, obs.date, obs.name, obs.worker, set.label,
        yesNo(set.from), yesNo(set.to), set.why,
        set.generated ? "예 — 규칙으로 만든 것" : "",
        change.applied ?? pending,
      ]);
    }

    if (change.noteAppend) {
      touched.add(obs.name);
      work.push([
        at, phase, obs.date, obs.name, obs.worker, "비고",
        obs.note || "(비어 있음)", change.noteAppend,
        "'필요시' 목욕으로 새로 체크해 그 까닭을 남깁니다",
        "예 — 규칙으로 만든 것",
        change.applied ?? pending,
      ]);
    }

    for (const warning of change.warnings) {
      attention.push(["확인 필요", obs.name, obs.date, warning]);
    }
  }

  if (work.length === 1) work.push(["", "", "", "", "", "고칠 것이 없습니다.", "", "", "", "", ""]);
  if (attention.length === 1) attention.push(["", "", "", "확인하실 것이 없습니다."]);

  const [min, max] = input.planOptions.asNeededPerMonth;
  const unreadable = input.observations.filter((o) => o.problem).length;
  const changed = input.changes.filter((c) => c.sets.length || c.noteAppend).length;

  const summary: Cell[][] = [
    ["항목", "값"],
    ["작업 일시", at],
    ["구분", phase === "점검" ? "점검 (포털에 쓰지 않음)" : "반영 (포털에 저장함)"],
    ["급여제공일", input.from + " ~ " + input.to],
    ["기준표 파일", input.referenceFile],
    ["기준표 시트", input.standards.sheetName + " · " + input.standards.list.length + "명"],
    ["", ""],
    ["전송내역", input.observations.length + "건"],
    ["상세를 읽지 못한 건", unreadable + "건"],
    ["고칠 줄", changed + "건"],
    ["고칠 항목", items + "개"],
    ["그중 규칙으로 만든 것", generated + "개"],
    ["관련된 어르신", touched.size + "명"],
    ["", ""],
    ["목욕 '필요시' 배정", "한 달에 " + min + "~" + max + "회 (되풀이해도 같은 날이 나옵니다)"],
    ["'필요시' 비고 문구", input.planOptions.asNeededNote],
    ["기준 초과 목욕", input.planOptions.removeExtraBath ? "해제함" : "해제하지 않고 알려만 드림"],
    ["목욕을 손대지 않는 비고", input.planOptions.bathSkipNotes.join(", ")],
    ["목욕 항목 이름", BATH_ITEM],
    ["기준표에 칸이 없어 손대지 않은 항목", UNMAPPED_ITEMS.join(", ")],
  ];

  const file = path.join(input.saveDir, "RFID" + phase + "-" + stamp() + ".xlsx");
  await writeWorkbook(file, [
    { name: "작업내역", rows: work, widths: [19, 6, 12, 10, 10, 16, 10, 8, 46, 20, 30] },
    { name: "확인필요", rows: attention, widths: [10, 10, 12, 84] },
    { name: "요약", rows: summary, widths: [30, 62] },
  ]);
  return file;
}
