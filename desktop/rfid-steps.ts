// RFID 전송내역 화면을 한 걸음씩 움직이는 코드.
//
// 가는 길: 포털 상단 [RFID] → [전송내역] → [요양요원-전송내역]
//          급여제공일을 정하고 「조회」 → 줄마다 「확인 수정」 → 항목 고치고 「저장」
//
// 업무수행일지 쪽(portal-steps.ts)과 같은 방식입니다. 한 번에 다 하는 큰
// 스크립트로 만들면 어디서 어긋났는지 알 수 없으므로, 걸음마다 결과를
// 돌려주고 바깥(rfid.ts)에서 기다렸다가 다음 걸음을 시킵니다.
//
// 단추와 항목은 id 가 아니라 적힌 글자로 찾습니다. id 는 화면 개편 때 잘
// 바뀌지만 "조회"·"목욕도움" 같은 글자는 잘 바뀌지 않기 때문입니다.
//
// ── 처음 쓰실 때 ────────────────────────────────────────────
// 이 화면의 실제 구조(자료 묶음 이름·항목 이름)는 아직 눈으로 확인하지
// 못했습니다. 그래서 먼저 「RFID 화면 살펴보기」로 무엇이 있는지 뽑아
// 보시고, 이름이 다르면 rfid-plan.ts 의 ITEM_TARGETS 와 아래 후보 목록만
// 고치면 됩니다. 억지로 맞히려 들지 않고, 못 찾으면 못 찾았다고 말합니다.

import { HELPERS } from "./portal-steps";

/** RFID 화면에서만 쓰는 도우미. 위의 공통 도우미 뒤에 붙습니다. */
const RFID_HELPERS = `
  // 화면에 놓인 구성요소를 종류별로 훑습니다.
  const componentsOfType = (types) => {
    const out = [];
    document.querySelectorAll("[id]").forEach((el) => {
      const id = el.id;
      if (!id || id.indexOf("mainframe") !== 0 || id.indexOf(":") >= 0) return;
      const c = resolve(id);
      if (!c) return;
      const t = c._type_name || "";
      if (types.indexOf(t) < 0) return;
      out.push({ path: id, comp: c, type: t });
    });
    return out;
  };

  // 체크 칸에 붙은 이름. 대개 체크 칸이 스스로 글자를 지니고 있습니다.
  // 없으면 바로 곁의 글자칸에서 가져옵니다.
  const labelOf = (c) => {
    try {
      if (typeof c.text === "string" && c.text.trim()) return c.text.trim();
    } catch (e) {}
    try {
      const box = c.getOffsetBounds ? c.getOffsetBounds() : null;
      if (!box) return "";
      let best = "";
      let bestGap = 200;
      for (const s of componentsOfType(["Static"])) {
        const sb = s.comp.getOffsetBounds ? s.comp.getOffsetBounds() : null;
        if (!sb || typeof s.comp.text !== "string" || !s.comp.text.trim()) continue;
        // 같은 줄에서 왼쪽에 붙어 있는 글자를 이름으로 봅니다.
        if (Math.abs(sb.top - box.top) > 12) continue;
        const gap = box.left - (sb.left + sb.width);
        if (gap < -4 || gap > bestGap) continue;
        bestGap = gap;
        best = s.comp.text.trim();
      }
      return best;
    } catch (e) { return ""; }
  };

  const squash = (s) => String(s == null ? "" : s).replace(/[\\s()·・]/g, "");

  // 화면의 체크 칸을 { 이름: {comp, value} } 로 모읍니다.
  // 같은 이름이 둘이면 나중 것(나중에 열린 창)을 씁니다.
  const checkboxMap = () => {
    const map = {};
    for (const item of componentsOfType(["CheckBox"])) {
      if (item.comp.visible === false) continue;
      const name = labelOf(item.comp);
      if (!name) continue;
      let on = false;
      try {
        const v = item.comp.value;
        on = v === true || v === "1" || v === 1 || v === "Y";
      } catch (e) {}
      map[squash(name)] = { path: item.path, comp: item.comp, label: name, on: on };
    }
    return map;
  };
`;

/** 걸음 하나를 감싸는 껍데기. 되풀이되는 부분을 줄입니다. */
function step(body: string): string {
  return (
    "(() => { try {" +
    HELPERS +
    RFID_HELPERS +
    body +
    " } catch (e) { return JSON.stringify({ ok: false, reason: String(e && e.message || e) }); } })()"
  );
}

/* ── 살펴보기 ──────────────────────────────────────────────── */

/**
 * 이 화면에 무엇이 있는지 뽑습니다.
 *
 * 자동화를 맞추려면 자료 묶음 이름과 항목 이름을 알아야 하는데, 화면에는
 * 어르신 성함과 인정번호가 함께 떠 있습니다. 값은 남기지 않고 '무엇이
 * 있는지'만 담습니다.
 */
export const STEP_RFID_PROBE = step(`
  const redact = (s) => {
    const t = String(s == null ? "" : s).trim();
    if (!t) return "";
    if (/L?\\d{10,}/.test(t)) return "《번호" + t.length + "》";
    if (/^[가-힣]{2,4}$/.test(t)) return "《이름》";
    if (/^\\d{4}[-.]?\\d{2}[-.]?\\d{2}$/.test(t)) return "《날짜》";
    return t.length > 20 ? "《글자" + t.length + "》" : t;
  };

  const datasets = [];
  for (const path of findForms()) {
    const f = resolve(path);
    if (!f) continue;
    for (const key in f) {
      try {
        const v = f[key];
        if (!v || v._type_name !== "Dataset") continue;
        const cols = [];
        const n = v.getColCount ? v.getColCount() : 0;
        for (let c = 0; c < n; c++) cols.push(v.getColID(c));
        const rows = v.getRowCount ? v.getRowCount() : -1;
        const first = {};
        if (rows > 0) for (const col of cols) first[col] = redact(v.getColumn(0, col));
        datasets.push({ form: path, name: key, rows: rows, cols: cols, firstRow: first });
      } catch (e) {}
    }
  }

  const boxes = [];
  for (const item of componentsOfType(["CheckBox"])) {
    boxes.push({
      path: item.path,
      label: labelOf(item.comp),
      on: item.comp.value === true || item.comp.value === "1",
      hidden: item.comp.visible === false,
    });
  }

  const grids = componentsOfType(["Grid"]).map((g) => ({
    path: g.path, binddataset: g.comp.binddataset || "", hidden: g.comp.visible === false,
  }));

  const inputs = componentsOfType(["Calendar", "MaskEdit", "Edit", "Combo", "Spin"]).map((i) => ({
    path: i.path, type: i.type, name: i.comp.name || "", value: redact(i.comp.value),
    hidden: i.comp.visible === false,
  }));

  const labels = [];
  for (const b of componentsOfType(["Button", "Static"])) {
    if (b.comp.visible === false) continue;
    if (typeof b.comp.text !== "string" || !b.comp.text.trim()) continue;
    labels.push({ path: b.path, type: b.type, text: b.comp.text.trim() });
  }

  return JSON.stringify({
    ok: true, url: location.href, forms: findForms(),
    datasets: datasets, checkboxes: boxes, grids: grids, inputs: inputs, labels: labels,
    alerts: takeAlerts(),
  });
`);

/* ── 조회 ──────────────────────────────────────────────────── */

/**
 * 급여제공일을 정하고 「조회」를 누릅니다.
 *
 * 날짜칸은 대개 Calendar 입니다. 시작·종료 두 칸이면 앞뒤로 넣고,
 * 한 칸뿐이면 시작일만 넣습니다(그 화면은 하루씩만 조회되는 것입니다).
 *
 * @param from YYYYMMDD
 * @param to   YYYYMMDD
 */
export function stepSearch(from: string, to: string): string {
  return step(`
    const from = ${JSON.stringify(from)};
    const to = ${JSON.stringify(to)};

    const dates = componentsOfType(["Calendar"]).filter((c) => c.comp.visible !== false);
    if (!dates.length) {
      return JSON.stringify({
        ok: false,
        reason: "급여제공일을 넣을 날짜칸(Calendar)을 찾지 못했습니다. RFID → 전송내역 → 요양요원-전송내역 화면이 열려 있는지 확인해 주십시오.",
        inputs: componentsOfType(["MaskEdit", "Edit"]).map((i) => i.comp.name || i.path),
      });
    }

    const filled = [];
    const put = (c, value) => {
      try {
        if (c.set_value) c.set_value(value); else c.value = value;
        // 화면이 값을 자료 묶음에 옮겨 담도록 알려 줍니다. 이것을 빠뜨리면
        // 눈에는 바뀌어 보여도 조회는 옛 날짜로 나갑니다.
        if (typeof c.updateToDataset === "function") c.updateToDataset();
        filled.push({ path: c.name || "", value: value });
        return true;
      } catch (e) { return false; }
    };

    if (dates.length >= 2) {
      put(dates[0].comp, from);
      put(dates[1].comp, to);
    } else {
      put(dates[0].comp, from);
    }

    if (!filled.length) return JSON.stringify({ ok: false, reason: "날짜칸에 값을 넣지 못했습니다." });

    const clicked = clickByText("조회");
    return JSON.stringify({
      ok: clicked.ok, reason: clicked.reason,
      filled: filled, dateFields: dates.length, alerts: takeAlerts(),
    });
  `);
}

/**
 * 조회 결과 목록을 읽습니다.
 *
 * 자료 묶음 이름을 미리 적어 두지 않았습니다. 대신 '성함·날짜처럼 보이는
 * 열을 지닌, 줄이 가장 많은 묶음'을 목록으로 봅니다. 화면이 조금 바뀌어도
 * 따라갈 수 있고, 못 찾으면 무엇을 보았는지 그대로 돌려줍니다.
 */
export const STEP_RFID_LIST = step(`
  const NAME_HINTS = ["RCPER_NM", "RCPR_NM", "SUGUP_NM", "FNM", "HNM", "NM"];
  const DATE_HINTS = ["RCPRV_YMD", "PAY_YMD", "PROV_YMD", "SVC_YMD", "YMD", "DT"];
  const WORKER_HINTS = ["CRGVR_NM", "WKER_NM", "EMPL_NM", "CARE_NM"];

  const pickColumn = (cols, hints) => {
    for (const hint of hints) {
      const hit = cols.find((c) => c.toUpperCase() === hint);
      if (hit) return hit;
    }
    for (const hint of hints) {
      const hit = cols.find((c) => c.toUpperCase().indexOf(hint) >= 0);
      if (hit) return hit;
    }
    return "";
  };

  let best = null;
  const seen = [];
  for (const path of findForms()) {
    const f = resolve(path);
    if (!f) continue;
    for (const key in f) {
      try {
        const ds = f[key];
        if (!ds || ds._type_name !== "Dataset") continue;
        const rows = ds.getRowCount ? ds.getRowCount() : 0;
        if (rows <= 0) continue;
        const cols = [];
        for (let c = 0; c < ds.getColCount(); c++) cols.push(ds.getColID(c));
        const nameCol = pickColumn(cols, NAME_HINTS);
        const dateCol = pickColumn(cols, DATE_HINTS);
        seen.push({ name: key, rows: rows, nameCol: nameCol, dateCol: dateCol });
        if (!nameCol || !dateCol) continue;
        if (!best || rows > best.rows) {
          best = { form: path, ds: ds, key: key, rows: rows, cols: cols,
                   nameCol: nameCol, dateCol: dateCol,
                   workerCol: pickColumn(cols, WORKER_HINTS) };
        }
      } catch (e) {}
    }
  }

  if (!best) {
    return JSON.stringify({
      ok: false,
      reason: "전송내역 목록을 찾지 못했습니다. 조회가 끝났는지, 결과가 있는지 확인해 주십시오.",
      candidates: seen,
    });
  }

  const rows = [];
  for (let i = 0; i < best.rows; i++) {
    const raw = String(best.ds.getColumn(i, best.dateCol) || "");
    const digits = raw.replace(/[^0-9]/g, "");
    const date = digits.length >= 8
      ? digits.slice(0, 4) + "-" + digits.slice(4, 6) + "-" + digits.slice(6, 8)
      : raw;
    rows.push({
      i: i,
      name: String(best.ds.getColumn(i, best.nameCol) || "").trim(),
      date: date,
      worker: best.workerCol ? String(best.ds.getColumn(i, best.workerCol) || "").trim() : "",
    });
  }

  return JSON.stringify({
    ok: true, dataset: best.key, form: best.form, cols: best.cols,
    used: { name: best.nameCol, date: best.dateCol, worker: best.workerCol },
    rows: rows, alerts: takeAlerts(),
  });
`);

/* ── 상세 창 ───────────────────────────────────────────────── */

/** 목록 i 번째 줄의 「확인 수정」을 누릅니다. */
export function stepOpenDetail(datasetName: string, index: number): string {
  return step(`
    const holder = formWithDataset(${JSON.stringify(datasetName)});
    if (!holder) return JSON.stringify({ ok: false, reason: "목록 자료(${datasetName})를 찾지 못했습니다." });
    const ds = holder.ds;
    if (${index} >= ds.getRowCount()) return JSON.stringify({ ok: false, done: true });

    // 그 줄을 고른 뒤 단추를 눌러야 그 줄의 상세가 열립니다.
    ds.set_rowposition(${index});

    for (const label of ["확인수정", "확인 수정", "확인/수정", "수정", "확인"]) {
      const r = clickByText(label);
      if (r.ok) return JSON.stringify({ ok: true, pressed: label, index: ${index}, alerts: takeAlerts() });
    }

    // 단추가 표 안에 그려져 있으면 글자로는 잡히지 않습니다. 사람이 하듯
    // 표를 두 번 눌러 여는 처리기를 직접 부릅니다.
    const owner = holder.form;
    for (const key in owner) {
      if (!/oncelldblclick$/.test(key)) continue;
      try {
        const grid = owner[key.replace(/_oncelldblclick$/, "")];
        if (!grid) continue;
        owner[key].call(owner, grid, { row: ${index}, cell: 0 });
        return JSON.stringify({ ok: true, pressed: key, index: ${index}, alerts: takeAlerts() });
      } catch (e) {}
    }

    return JSON.stringify({
      ok: false,
      reason: "「확인 수정」 단추를 찾지 못했습니다.",
      buttons: componentsOfType(["Button"]).filter((b) => b.comp.visible !== false)
        .map((b) => String(b.comp.text || "")).filter(Boolean),
    });
  `);
}

/**
 * 상세 창에서 항목과 비고를 읽습니다.
 *
 * 창은 곧바로 뜨지만 내용은 서버에서 따로 받아 옵니다. 채워지기 전에
 * 읽으면 전부 꺼져 있는 것으로 보여, 멀쩡한 기록을 고치려 들게 됩니다.
 * 그래서 '몇 개나 보이는지'를 함께 돌려주어 바깥에서 기다릴 수 있게 합니다.
 */
export function stepReadDetail(expected: string[]): string {
  return step(`
    const want = ${JSON.stringify(expected)};
    const map = checkboxMap();
    const checked = {};
    const found = [];
    const missing = [];
    for (const label of want) {
      const hit = map[squash(label)];
      if (hit) { checked[label] = hit.on; found.push(label); }
      else missing.push(label);
    }

    // 비고칸은 여러 줄 입력칸(TextArea)이거나 한 줄 입력칸(Edit)입니다.
    let note = "";
    let notePath = "";
    for (const item of componentsOfType(["TextArea", "Edit"])) {
      if (item.comp.visible === false) continue;
      const name = String(item.comp.name || "");
      const label = labelOf(item.comp);
      if (!/비고|특이|기타/.test(name + " " + label)) continue;
      note = String(item.comp.value == null ? "" : item.comp.value);
      notePath = item.path;
      break;
    }

    return JSON.stringify({
      ok: found.length > 0,
      reason: found.length ? undefined : "상세 창에서 급여 항목을 하나도 찾지 못했습니다.",
      checked: checked, found: found.length, missing: missing,
      totalBoxes: Object.keys(map).length,
      seen: Object.keys(map).slice(0, 40),
      note: note, notePath: notePath, alerts: takeAlerts(),
    });
  `);
}

/**
 * 상세 창의 항목을 고칩니다. 저장은 하지 않습니다.
 *
 * 저장을 따로 둔 것은, 고치다 하나라도 어긋나면 저장하지 않고 물러나기
 * 위해서입니다. 반쯤 고친 기록을 남기는 것이 가장 나쁩니다.
 */
export function stepApplyDetail(
  sets: { label: string; to: boolean }[],
  noteAppend?: string
): string {
  return step(`
    const sets = ${JSON.stringify(sets)};
    const noteAppend = ${JSON.stringify(noteAppend ?? "")};
    const map = checkboxMap();

    const done = [];
    const failed = [];
    for (const s of sets) {
      const hit = map[squash(s.label)];
      if (!hit) { failed.push({ label: s.label, reason: "항목을 찾지 못했습니다." }); continue; }
      try {
        if (hit.comp.set_value) hit.comp.set_value(s.to); else hit.comp.value = s.to;
        if (typeof hit.comp.updateToDataset === "function") hit.comp.updateToDataset();
        // 정말 바뀌었는지 되읽습니다. 넣었다고 다 들어가지는 않습니다.
        const now = hit.comp.value === true || hit.comp.value === "1" || hit.comp.value === 1;
        if (now !== s.to) { failed.push({ label: s.label, reason: "값이 바뀌지 않았습니다." }); continue; }
        done.push({ label: s.label, to: s.to });
      } catch (e) {
        failed.push({ label: s.label, reason: String(e && e.message || e) });
      }
    }

    let noteWritten = "";
    if (noteAppend) {
      for (const item of componentsOfType(["TextArea", "Edit"])) {
        if (item.comp.visible === false) continue;
        const name = String(item.comp.name || "");
        const label = labelOf(item.comp);
        if (!/비고|특이|기타/.test(name + " " + label)) continue;
        const current = String(item.comp.value == null ? "" : item.comp.value).trim();
        // 이미 적힌 글이 있으면 손대지 않습니다. 사람이 쓴 글을 우리가
        // 밀어내는 일이 없어야 합니다.
        if (current) break;
        try {
          if (item.comp.set_value) item.comp.set_value(noteAppend); else item.comp.value = noteAppend;
          if (typeof item.comp.updateToDataset === "function") item.comp.updateToDataset();
          noteWritten = noteAppend;
        } catch (e) {}
        break;
      }
      if (!noteWritten) failed.push({ label: "비고", reason: "비고칸을 찾지 못했거나 이미 적혀 있습니다." });
    }

    return JSON.stringify({
      ok: failed.length === 0, done: done, failed: failed,
      noteWritten: noteWritten, alerts: takeAlerts(),
    });
  `);
}

/** 상세 창의 「저장」을 누릅니다. */
export const STEP_RFID_SAVE = step(`
  for (const label of ["저장", "확인", "적용"]) {
    const r = clickByText(label);
    if (r.ok) return JSON.stringify({ ok: true, pressed: label, alerts: takeAlerts() });
  }
  return JSON.stringify({ ok: false, reason: "「저장」 단추를 찾지 못했습니다.", alerts: takeAlerts() });
`);

/** 상세 창을 닫아 다음 줄로 넘어갑니다. */
export const STEP_RFID_CLOSE = step(`
  const closed = [];
  for (const text of ["닫기", "취소"]) {
    const r = clickByText(text);
    if (r.ok) closed.push(text);
  }
  return JSON.stringify({ ok: true, closed: closed, alerts: takeAlerts() });
`);
