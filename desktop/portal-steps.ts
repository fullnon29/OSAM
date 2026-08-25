// 포털 화면을 한 걸음씩 움직이는 코드.
//
// 한 번에 다 하는 큰 스크립트로 만들면 어디서 어긋났는지 알 수 없습니다.
// 걸음마다 결과를 돌려주고, 바깥(main.ts)에서 기다렸다가 다음 걸음을 시킵니다.
//
// 화면 구조는 실제로 받아 본 것을 근거로 합니다.
//   목록 화면  npsb210m01
//     ds_SswBusiEntOutTgt  어르신 목록 (LTC_MGMT_NO, FNM, POF_PLNPP_MGMT_NO …)
//     ds_tbnpsb40          그 어르신의 일지 목록 (WRT_DT, VIS_DT, SIGNG_STAT_CD_NM …)
//   기록 창    npsb210p02  → 「양식 인쇄」
//   경고 창    nptz001p03  → 「확인」
//   인쇄 뷰어  ClipReport4 → PDF 내려받기
//
// 단추는 id 가 아니라 적힌 글자로 찾습니다. id 는 화면 개편 때 잘 바뀌지만
// "양식 인쇄" 같은 글자는 잘 바뀌지 않기 때문입니다.

/**
 * 화면 안에서 공통으로 쓰는 도우미. 모든 걸음 앞에 붙습니다.
 *
 * RFID 전송내역 걸음들(rfid-steps.ts)도 같은 것을 씁니다. 두 벌로 두면
 * 한쪽만 고쳐 놓고 다른 쪽이 안 되는 일이 생기기 때문입니다.
 */
export const HELPERS = `
  // 이 틀에 화면이 없으면(빈 창·인쇄 뷰어 등) 더 볼 것이 없습니다.
  // 여기서 나는 오류가 진짜 원인을 덮지 않도록 표시를 붙여 돌려보냅니다.
  if (typeof nexacro === "undefined" || !nexacro.getApplication) {
    return JSON.stringify({ ok: false, noNexacro: true, reason: "이 틀에는 포털 화면이 없습니다." });
  }

  // 포털이 띄우는 알림창은 화면을 멈춰 세웁니다. 자동화가 그대로 얼어붙으므로
  // 글만 받아 두고 넘어갑니다. 무엇이 떴는지는 걸음마다 함께 돌려줍니다.
  //
  // 물어보는 창(confirm)은 '아니오'로 답합니다. 무엇을 묻는지 모르는 채
  // '예'를 누르면 지우기 같은 일이 벌어질 수 있기 때문입니다. 무엇을 물었는지는
  // 기록에 남으니, 필요하면 그때 판단하면 됩니다.
  if (!window.__osamAlerts) {
    window.__osamAlerts = [];
    window.alert = function (m) { window.__osamAlerts.push("알림: " + String(m)); };
    window.confirm = function (m) { window.__osamAlerts.push("확인요청(아니오로 답함): " + String(m)); return false; };
    window.prompt = function (m) { window.__osamAlerts.push("입력요청: " + String(m)); return null; };
  }
  const takeAlerts = () => {
    const out = window.__osamAlerts.slice();
    window.__osamAlerts.length = 0;
    return out;
  };

  const app = nexacro.getApplication();

  // 열려 있는 작업 화면(form)을 찾습니다.
  const findForms = () => {
    const out = [];
    document.querySelectorAll("[id]").forEach((el) => {
      const id = el.id;
      if (!id || id.indexOf("mainframe") !== 0) return;
      if (!/\\.form$/.test(id)) return;
      if (id.indexOf(":") >= 0) return;
      out.push(id);
    });
    return out;
  };

  const resolve = (path) => {
    let cur = app;
    for (const part of path.split(".")) {
      if (cur == null) return null;
      cur = cur[part];
    }
    return cur;
  };

  // 화면 id(npsb210m01 등)로 작업 화면을 찾습니다.
  const formByScreenId = (screenId) => {
    for (const path of findForms()) {
      const f = resolve(path);
      if (!f) continue;
      try {
        const t = f.sta_bizTitleid;
        if (t && t.text === screenId) return { path, form: f };
        // 기록 창처럼 제목칸이 없는 화면은 자료 묶음으로 알아봅니다.
        if (!t && f.url && String(f.url).indexOf(screenId) >= 0) return { path, form: f };
      } catch (e) {}
    }
    return null;
  };

  // 자료 묶음이 실제로 놓인 화면을 찾습니다.
  //
  // 경로를 미리 적어 두면 화면이 조금만 바뀌어도 어긋납니다. 실제로
  // 그 자료를 가진 화면을 찾아가는 편이 훨씬 안전합니다.
  const formWithDataset = (dsName) => {
    for (const path of findForms()) {
      const f = resolve(path);
      if (!f) continue;
      try {
        const ds = f[dsName];
        if (ds && ds._type_name === "Dataset") return { path, form: f, ds };
      } catch (e) {}
    }
    return null;
  };

  // 적힌 글자로 단추를 찾습니다. 숨겨진 것은 셈에서 뺍니다.
  const buttonsByText = (text) => {
    const hits = [];
    document.querySelectorAll("[id]").forEach((el) => {
      const id = el.id;
      if (!id || id.indexOf("mainframe") !== 0 || id.indexOf(":") >= 0) return;
      const c = resolve(id);
      if (!c) return;
      const type = c._type_name || "";
      if (type !== "Button" && type !== "Static") return;
      if (typeof c.text !== "string") return;
      if (c.text.replace(/\\s/g, "") !== text.replace(/\\s/g, "")) return;
      if (c.visible === false) return;
      hits.push({ path: id, comp: c });
    });
    return hits;
  };

  const clickByText = (text) => {
    const hits = buttonsByText(text);
    if (!hits.length) return { ok: false, reason: "단추를 찾지 못했습니다: " + text };
    const target = hits[hits.length - 1].comp;  // 나중에 열린 창의 것이 뒤에 옵니다
    try {
      if (typeof target.click === "function") { target.click(); return { ok: true, path: hits[hits.length-1].path }; }
    } catch (e) {}
    // click() 이 없으면 onclick 을 직접 부릅니다.
    try {
      const owner = target.parent;
      const handler = owner && owner[target.name + "_onclick"];
      if (typeof handler === "function") { handler.call(owner, target, {}); return { ok: true, path: hits[hits.length-1].path }; }
    } catch (e) {}
    return { ok: false, reason: "단추를 누르지 못했습니다: " + text };
  };
`;

/** 지금 열린 화면이 무엇이고 어르신·일지가 몇 건인지 봅니다. */
export const STEP_PROBE = `(() => { try {
  ${HELPERS}
  const screen = formByScreenId("npsb210m01");
  const tgtHolder = formWithDataset("ds_SswBusiEntOutTgt");
  if (!tgtHolder) {
    return JSON.stringify({
      ok: false,
      reason: "어르신 목록 자료(ds_SswBusiEntOutTgt)를 어느 화면에서도 찾지 못했습니다. "
        + "업무수행일지 목록 화면이 열려 있고 조회가 된 상태인지 확인해 주십시오.",
      screenFound: !!screen,
      formsOpen: findForms().length,
    });
  }
  const logHolder = formWithDataset("ds_tbnpsb40");
  return JSON.stringify({
    ok: true,
    formPath: tgtHolder.path,
    recipients: tgtHolder.ds.getRowCount(),
    recipientRow: tgtHolder.ds.rowposition,
    logs: logHolder ? logHolder.ds.getRowCount() : -1,
  });
} catch (e) { return JSON.stringify({ ok: false, reason: String(e && e.message || e) }); } })()`;

/** 어르신 목록에서 i 번째를 고릅니다. 고르면 그 어르신의 일지가 채워집니다. */
export function stepSelectRecipient(index: number): string {
  return `(() => { try {
    ${HELPERS}
    const holder = formWithDataset("ds_SswBusiEntOutTgt");
    if (!holder) return JSON.stringify({ ok: false, reason: "어르신 목록 자료를 찾지 못했습니다." });
    const tgt = holder.ds;
    if (${index} >= tgt.getRowCount()) return JSON.stringify({ ok: false, done: true });
    tgt.set_rowposition(${index});
    return JSON.stringify({
      ok: true,
      index: ${index},
      total: tgt.getRowCount(),
      ltcNo: tgt.getColumn(${index}, "LTC_MGMT_NO"),
      grade: tgt.getColumn(${index}, "LTC_RCGT_GRADE_NM"),
    });
  } catch (e) { return JSON.stringify({ ok: false, reason: String(e && e.message || e) }); } })()`;
}

/** 지금 고른 어르신의 일지 목록을 봅니다. */
export const STEP_LIST_LOGS = `(() => { try {
  ${HELPERS}
  const holder = formWithDataset("ds_tbnpsb40");
  if (!holder) return JSON.stringify({ ok: false, reason: "일지 목록 자료를 찾지 못했습니다." });
  const ds = holder.ds;
  const rows = [];
  for (let i = 0; i < ds.getRowCount(); i++) {
    rows.push({
      i: i,
      wrtDt: ds.getColumn(i, "WRT_DT"),
      visDt: ds.getColumn(i, "VIS_DT"),
      status: ds.getColumn(i, "SIGNG_STAT_CD_NM"),
    });
  }
  return JSON.stringify({ ok: true, rows: rows });
} catch (e) { return JSON.stringify({ ok: false, reason: String(e && e.message || e) }); } })()`;

/** 일지 j 번째를 열어 기록 창을 띄웁니다. */
export function stepOpenLog(index: number): string {
  return `(() => { try {
    ${HELPERS}
    const holder = formWithDataset("ds_tbnpsb40");
    if (!holder) return JSON.stringify({ ok: false, reason: "일지 목록 자료를 찾지 못했습니다." });
    const ds = holder.ds;
    if (${index} >= ds.getRowCount()) return JSON.stringify({ ok: false, done: true });
    ds.set_rowposition(${index});

    // 표를 두 번 눌러 여는 것이 사람이 하는 동작입니다. 그 처리기를 직접 부릅니다.
    const owner = holder.form;
    const grid = owner.grd_list;
    if (!grid) return JSON.stringify({ ok: false, reason: "일지 표(grd_list)를 찾지 못했습니다." });
    const handler = owner["grd_list_oncelldblclick"] || owner["grd_list_oncellclick"];
    if (typeof handler !== "function") {
      return JSON.stringify({ ok: false, reason: "표를 여는 처리기를 찾지 못했습니다." });
    }
    handler.call(owner, grid, { row: ${index}, cell: 0 });
    return JSON.stringify({ ok: true, index: ${index} });
  } catch (e) { return JSON.stringify({ ok: false, reason: String(e && e.message || e) }); } })()`;
}

/**
 * 기록창이 '그 어르신의 그 일지'를 열고 있는지 확인합니다.
 *
 * 채워져 있는지만 보면 안 됩니다. 앞 건의 창이 닫히지 않고 남아 있으면
 * 그 내용이 그대로 보여 통과해 버리고, 같은 문서를 몇 백 번 내려받게 됩니다
 * (실제로 465건을 같은 어르신 것으로 받았습니다).
 *
 * 그래서 목록에서 고른 인정번호와 창에 뜬 인정번호가 같은지 대조합니다.
 * 숫자만 비교합니다 — 마스크 입력칸이라 L 이 붙기도 하고 안 붙기도 합니다.
 */
export function stepRecordReady(expectedLtcNo: string): string {
  return `(() => { try {
    ${HELPERS}
    const wantDigits = ${JSON.stringify(expectedLtcNo)}.replace(/[^0-9]/g, "");
    let matched = false;
    let sawOther = false;
    let filledCount = 0;

    document.querySelectorAll("[id]").forEach((el) => {
      const id = el.id;
      if (!id || id.indexOf("mainframe") !== 0 || id.indexOf(":") >= 0) return;
      const c = resolve(id);
      if (!c) return;
      const type = c._type_name || "";
      if (type !== "Edit" && type !== "MaskEdit" && type !== "Static") return;
      if (c.visible === false) return;

      let v = "";
      try {
        const raw = c.value != null && c.value !== "" ? c.value : c.text;
        v = raw == null ? "" : String(raw).trim();
      } catch (e) { return; }
      if (!v) return;
      filledCount++;

      const digits = v.replace(/[^0-9]/g, "");
      if (digits.length !== 10) return;
      if (wantDigits && digits === wantDigits) matched = true;
      else sawOther = true;
    });

    return JSON.stringify({
      ok: matched,
      reason: matched
        ? undefined
        : sawOther
          ? "기록창에 다른 어르신의 내용이 떠 있습니다. 앞 창이 닫히지 않은 것입니다."
          : "기록창에 아직 자료가 채워지지 않았습니다.",
      filledCount: filledCount,
      sawOther: sawOther,
    });
  } catch (e) { return JSON.stringify({ ok: false, reason: String(e && e.message || e) }); } })()`;
}

/**
 * 인쇄 단추를 누릅니다.
 *
 * 화면에 인쇄 단추가 둘입니다.
 *   「인쇄」      — 적힌 내용이 그대로 찍힙니다
 *   「양식 인쇄」 — 손으로 쓰시라고 주는 빈 양식입니다
 * 앞의 것을 눌러야 합니다. 「양식 인쇄」를 누르면 아무리 기다려도 빈 종이가
 * 내려옵니다. 어느 것을 눌렀는지 함께 돌려주어 기록에 남게 합니다.
 */
export const STEP_CLICK_PRINT = `(() => { try {
  ${HELPERS}
  for (const label of ["인쇄", "양식 인쇄"]) {
    const r = clickByText(label);
    // 누른 뒤에 뜬 알림도 함께 돌려줍니다. 물어보는 창은 '아니오'로 답하게
    // 되어 있어, 여기서 조용히 막히면 미리보기가 뜨지 않는데도 성공으로
    // 보입니다. 무엇을 물었는지는 남아야 합니다.
    if (r.ok) return JSON.stringify({ ok: true, pressed: label, path: r.path, alerts: takeAlerts() });
  }
  return JSON.stringify({ ok: false, reason: "인쇄 단추를 찾지 못했습니다.", alerts: takeAlerts() });
} catch (e) { return JSON.stringify({ ok: false, reason: String(e && e.message || e) }); } })()`;

/**
 * 개인정보 열람 경고에서 사유를 고르고 「확인」을 누릅니다.
 *
 * 콤보에서 항목을 읽는 방법이 판마다 다릅니다. 한 가지만 쓰면 이번처럼
 * 아무것도 못 읽고 멈춥니다. 세 가지를 차례로 시도합니다.
 *   1) getItemCount / getItemText  — Nexacro 가 내주는 방법
 *   2) innerdataset                — 콤보가 속에 지닌 자료
 *   3) binddataset                 — 화면의 자료를 갖다 쓰는 경우
 *
 * 그래도 못 읽으면 무엇을 보았는지 낱낱이 돌려줍니다. 다음 번에 또
 * 빈손으로 물어보지 않기 위해서입니다.
 */
export function stepConfirmWarning(reason: string): string {
  return `(() => { try {
    ${HELPERS}
    const wanted = ${JSON.stringify(reason)};
    const want = wanted.replace(/\s/g, "");

    const combos = [];
    document.querySelectorAll("[id]").forEach((el) => {
      const id = el.id;
      if (!id || id.indexOf("mainframe") !== 0 || id.indexOf(":") >= 0) return;
      const c = resolve(id);
      if (!c || c._type_name !== "Combo" || c.visible === false) return;
      combos.push({ path: id, c: c });
    });

    if (!combos.length) {
      return JSON.stringify({
        ok: false,
        reason: "열람 사유를 고르는 칸을 찾지 못했습니다.",
        alerts: takeAlerts(),
      });
    }

    // 한 콤보에서 항목을 읽어 냅니다. { labels, pick(i) } 를 돌려줍니다.
    const readItems = (c) => {
      // 1) Nexacro 가 내주는 방법
      try {
        const n = c.getItemCount ? c.getItemCount() : 0;
        if (n > 0) {
          const labels = [];
          for (let i = 0; i < n; i++) labels.push(String(c.getItemText(i)));
          return { how: "getItemCount", labels: labels, pick: (i) => c.set_index(i) };
        }
      } catch (e) {}

      // 2) 콤보가 속에 지닌 자료
      for (const key of ["innerdataset", "_innerdataset"]) {
        try {
          const ds = c[key];
          if (ds && ds.getRowCount && ds.getRowCount() > 0) {
            const dataCol = c.datacolumn || "datacolumn";
            const codeCol = c.codecolumn || "codecolumn";
            const labels = [];
            for (let i = 0; i < ds.getRowCount(); i++) labels.push(String(ds.getColumn(i, dataCol)));
            return {
              how: key,
              labels: labels,
              pick: (i) => {
                if (c.set_value) c.set_value(ds.getColumn(i, codeCol));
                else if (c.set_index) c.set_index(i);
              },
            };
          }
        } catch (e) {}
      }

      // 3) 화면의 자료를 갖다 쓰는 경우
      try {
        const name = c.binddataset;
        if (name) {
          const owner = c.parent;
          const ds = owner && owner[name];
          if (ds && ds.getRowCount && ds.getRowCount() > 0) {
            const dataCol = c.datacolumn || "datacolumn";
            const codeCol = c.codecolumn || "codecolumn";
            const labels = [];
            for (let i = 0; i < ds.getRowCount(); i++) labels.push(String(ds.getColumn(i, dataCol)));
            return {
              how: "binddataset:" + name,
              labels: labels,
              pick: (i) => {
                if (c.set_value) c.set_value(ds.getColumn(i, codeCol));
                else if (c.set_index) c.set_index(i);
              },
            };
          }
        }
      } catch (e) {}

      return null;
    };

    const notes = [];
    let picked = null;

    for (const item of combos) {
      const c = item.c;
      const read = readItems(c);
      if (!read || !read.labels.length) {
        // 무엇을 보았는지 적어 둡니다. 다음 번에 빈손으로 묻지 않기 위해서입니다.
        notes.push({
          path: item.path,
          text: c.text || "",
          getItemCount: typeof c.getItemCount,
          innerdataset: c.innerdataset ? "있음" : "없음",
          binddataset: c.binddataset || "없음",
          datacolumn: c.datacolumn || "없음",
          codecolumn: c.codecolumn || "없음",
        });
        continue;
      }

      notes.push({ path: item.path, how: read.how, labels: read.labels });

      for (let i = 0; i < read.labels.length; i++) {
        if (read.labels[i].replace(/\s/g, "").indexOf(want) < 0) continue;
        try {
          read.pick(i);
          if (typeof c.updateToDataset === "function") c.updateToDataset();
          picked = c.text || read.labels[i];
        } catch (e) {}
        break;
      }
      if (picked !== null) break;
    }

    if (picked === null) {
      const all = [];
      for (const n of notes) if (n.labels) all.push.apply(all, n.labels);
      return JSON.stringify({
        ok: false,
        reason: "열람 사유 " + wanted + " 를 고를 수 없었습니다.",
        options: all,
        combos: notes,
        alerts: takeAlerts(),
      });
    }

    const clicked = clickByText("확인");
    return JSON.stringify({
      ok: clicked.ok,
      reason: clicked.reason,
      recordedAs: picked,
      options: (notes.find((n) => n.labels) || {}).labels || [],
      alerts: takeAlerts(),
    });
  } catch (e) { return JSON.stringify({ ok: false, reason: String(e && e.message || e) }); } })()`;
}

/** 인쇄 뷰어에서 PDF 내려받기를 누릅니다. */
export function stepExportPdf(expectedYmds: string[]): string {
  return `(() => { try {
    ${HELPERS}
    // 미리보기에 뜬 것이 '지금 받으려는 그 일지'인지 확인하고 누릅니다.
    //
    // 그냥 눈에 띄는 PDF 단추를 누르면 안 됩니다. 앞 건의 미리보기가 닫히지
    // 않고 남아 있으면 그것을 눌러 같은 일지를 몇 번이고 다시 받게 됩니다.
    // 화면에는 다음 일지를 여는 것처럼 보이므로 알아채기도 어렵습니다
    // (실제로 465건을 같은 어르신 같은 날짜로 받았습니다).
    //
    // 그래서 미리보기 글에 그 일지의 급여제공일이 들어 있는지 봅니다.
    //
    // 적는 모양이 화면마다 달라 너그럽게 찾습니다. 2026-08-12 · 2026.8.12 ·
    // 2026년 8월 12일 · 20260812 를 모두 같은 날로 봅니다. 여기서 깐깐하게
    // 굴면 멀쩡한 화면에서도 한 건도 못 받게 됩니다.
    //
    // 날짜를 여럿 받습니다. 일지 목록에는 작성일자와 방문일자가 따로 있는데
    // 인쇄물에 어느 쪽이 찍히는지는 화면마다 다릅니다. 하나만 보고 막으면
    // 멀쩡한 미리보기를 거부하게 됩니다. 그중 하나라도 맞으면 누릅니다.
    const BUTTON = "#btnPdf, .btnPdf, [title*='PDF'], [alt*='PDF'], img[src*='pdf']";

    const datePattern = (raw) => {
      const ymd = String(raw == null ? "" : raw).replace(/[^0-9]/g, "");
      if (ymd.length < 8) return null;
      const y = ymd.slice(0, 4);
      const m = String(Number(ymd.slice(4, 6)));
      const d = String(Number(ymd.slice(6, 8)));
      return new RegExp(y + "\\\\D{0,3}0?" + m + "\\\\D{0,3}0?" + d + "(?!\\\\d)");
    };
    const wanted = ${JSON.stringify(expectedYmds)}.map(datePattern).filter(Boolean);

    const textOf = (doc) => {
      try {
        const body = doc.body;
        return body ? String(body.innerText || body.textContent || "") : "";
      } catch (e) { return ""; }
    };

    let seen = 0;
    let mismatched = 0;

    const viewers = [];
    document.querySelectorAll("iframe").forEach((fr) => {
      let doc = null;
      try { doc = fr.contentDocument; } catch (e) { return; }
      if (!doc) return;
      const btn = doc.querySelector(BUTTON);
      if (btn) viewers.push({ doc: doc, btn: btn, where: "iframe" });
    });
    const own = document.querySelector(BUTTON);
    if (own) viewers.push({ doc: document, btn: own, where: "page" });

    // 미리보기에 무슨 날짜가 적혀 있었는지 모아 둡니다. 막기만 하고 무엇을
    // 보았는지 말하지 않으면, 앞 건이 남은 것인지 우리가 엉뚱한 날짜로
    // 견준 것인지 알 수 없어 또 여쭤봐야 합니다.
    const sawDates = [];

    for (const v of viewers) {
      seen++;
      const text = textOf(v.doc);
      const found = text ? (text.match(/20\\d{2}\\D{0,3}\\d{1,2}\\D{0,3}\\d{1,2}/g) || []) : [];
      for (const f of found.slice(0, 4)) if (sawDates.indexOf(f) < 0) sawDates.push(f);

      // 날짜가 보일 때에만 견줍니다.
      //
      // 미리보기 창의 글자는 도구모음(인쇄·PDF·닫기)뿐이고 보고서 본문은
      // 그 안에 그림으로 그려지는 경우가 있습니다. 그런 화면에서 '날짜가
      // 없다'를 '날짜가 다르다'로 보면 한 건도 받지 못합니다. 실제로
      // 그렇게 되어 전체가 막혔습니다.
      //
      // 날짜가 안 보이면 여기서는 판단하지 않고 넘어갑니다. 잘못 받았는지는
      // 내려받은 PDF 를 열어 대조하는 쪽에서 잡습니다. 그쪽은 본문이 통째로
      // 들어 있어 확실합니다.
      const judgeable = found.length > 0 && wanted.length > 0;
      if (judgeable && !wanted.some((re) => re.test(text))) { mismatched++; continue; }

      v.btn.click();
      return JSON.stringify({ ok: true, where: v.where, checked: judgeable });
    }

    if (mismatched) {
      return JSON.stringify({
        ok: false,
        waiting: true,
        reason: "미리보기에 이 일지가 아직 뜨지 않았습니다.",
        viewers: seen,
        sawDates: sawDates,
      });
    }
    // 미리보기를 하나도 못 찾았습니다. 무엇이 있었는지 적어 둡니다. 이것이
    // 없으면 "미리보기가 안 떴다"와 "우리 선택자가 못 알아본다"를 가릴 수
    // 없어, 화면을 보지 못하는 채로 또 짐작하게 됩니다.
    const frames = [];
    document.querySelectorAll("iframe").forEach((fr) => {
      let doc = null;
      try { doc = fr.contentDocument; } catch (e) { frames.push("남의틀"); return; }
      if (!doc) { frames.push("빈틀"); return; }
      const src = String(fr.getAttribute("src") || "").slice(0, 60);
      // 그 틀에 단추처럼 생긴 것이 무엇이 있는지 몇 개만 봅니다.
      const marks = [];
      try {
        doc.querySelectorAll("img, button, a, input[type=button], input[type=image]").forEach((el) => {
          if (marks.length >= 6) return;
          const tag = el.tagName.toLowerCase();
          const hint = String(el.id || el.className || el.getAttribute("title") ||
                              el.getAttribute("alt") || el.getAttribute("src") || "").slice(0, 30);
          if (hint) marks.push(tag + ":" + hint);
        });
      } catch (e) {}
      frames.push((src || "(src없음)") + " → " + (marks.length ? marks.join(" / ") : "단추같은것없음"));
    });

    return JSON.stringify({
      ok: false,
      reason: "PDF 단추를 찾지 못했습니다.",
      viewers: seen,
      frames: frames,
    });
  } catch (e) { return JSON.stringify({ ok: false, reason: String(e && e.message || e) }); } })()`;
}

/**
 * 인쇄 미리보기를 치웁니다.
 *
 * 미리보기는 새 창이 아니라 화면 안의 틀(iframe)로 들어옵니다. 그래서 창을
 * 정리해도 남아 있고, 남아 있으면 다음 일지를 인쇄해도 앞 건이 그대로
 * 보입니다. 한 건이 끝날 때마다 이것을 불러 비워야 합니다.
 *
 * 미리보기 안의 「닫기」 단추만 누릅니다. 사람이 하는 것과 같은 동작입니다.
 *
 * 한때 닫기가 없으면 틀을 about:blank 로 돌리게 해 보았는데, 그렇게 하면
 * 포털이 그 틀을 다시 채우지 못해 미리보기가 아예 뜨지 않았습니다. 첫 건부터
 * "PDF 단추를 찾지 못했습니다 · 미리보기 0개" 로 멎었습니다. 우리가 만들지
 * 않은 화면을 우리 마음대로 비우면 안 됩니다.
 */
export const STEP_CLOSE_PREVIEW = `(() => { try {
  ${HELPERS}
  const BUTTON = "#btnPdf, .btnPdf, [title*='PDF'], [alt*='PDF'], img[src*='pdf']";
  const CLOSE = "#btnClose, .btnClose, #btnExit, [title*='닫기'], [alt*='닫기'], [title*='Close'], [alt*='Close']";

  const cleared = [];
  document.querySelectorAll("iframe").forEach((fr) => {
    let doc = null;
    try { doc = fr.contentDocument; } catch (e) { return; }
    if (!doc) return;
    // 미리보기인지 알아보는 표시: PDF 단추가 들어 있는 틀입니다.
    if (!doc.querySelector(BUTTON)) return;

    const closeBtn = doc.querySelector(CLOSE);
    if (!closeBtn) { cleared.push("닫기없음"); return; }
    try { closeBtn.click(); cleared.push("닫기"); } catch (e) { cleared.push("누르지못함"); }
  });

  return JSON.stringify({ ok: true, cleared: cleared, alerts: takeAlerts() });
} catch (e) { return JSON.stringify({ ok: false, reason: String(e && e.message || e) }); } })()`;

/**
 * 기록창만 닫습니다.
 *
 * 그냥 「닫기」를 누르면 안 됩니다. 목록 화면에도 「닫기」가 있어서 업무수행일지
 * 화면 자체가 닫혀 버립니다(실제로 그렇게 되어 자료를 통째로 잃었습니다).
 *
 * 기록창에만 있는 「인쇄」 단추를 먼저 찾아, 그 단추와 같은 화면에 있는
 * 「닫기」를 누릅니다. 기록창이 없으면 아무것도 하지 않습니다.
 */
export const STEP_CLOSE = `(() => { try {
  ${HELPERS}
  // 기록창을 알아보는 표시: 「인쇄」나 「양식 인쇄」가 있는 화면입니다.
  let recordForm = null;
  for (const label of ["인쇄", "양식 인쇄"]) {
    const hits = buttonsByText(label);
    if (hits.length) {
      recordForm = hits[hits.length - 1].comp.parent;
      break;
    }
  }
  if (!recordForm) return JSON.stringify({ ok: true, closed: false, reason: "기록창이 열려 있지 않습니다." });

  // 그 화면 안의 닫기를 찾습니다.
  const hits = buttonsByText("닫기").filter((h) => h.comp.parent === recordForm);
  if (!hits.length) return JSON.stringify({ ok: true, closed: false, reason: "기록창의 닫기를 찾지 못했습니다." });

  const target = hits[hits.length - 1].comp;
  try {
    if (typeof target.click === "function") target.click();
    else {
      const handler = recordForm[target.name + "_onclick"];
      if (typeof handler === "function") handler.call(recordForm, target, {});
    }
  } catch (e) {
    return JSON.stringify({ ok: false, reason: String(e && e.message || e) });
  }
  return JSON.stringify({ ok: true, closed: true, alerts: takeAlerts() });
} catch (e) { return JSON.stringify({ ok: false, reason: String(e && e.message || e) }); } })()`;
